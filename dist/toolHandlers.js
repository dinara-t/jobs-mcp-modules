import { createApiClient, toErrorResult } from "./apiClient.js";
import { asTextResult, formatAssignmentSummary, formatAvailableTemps, formatBestTempSuggestion, formatJobDetails, formatTempAvailabilityExplanation, formatTempDetails, formatUnassignmentSummary, getJobDisplayName, getTempDisplayName, } from "./formatters.js";
import { extractQuotedPhrases, includesWholePhrase, normalizeText, uniqueById, } from "./chatText.js";
async function fetchVisibleTemps(context) {
    const api = createApiClient(context);
    const response = await api.get("/temps", {
        params: {
            page: 0,
            size: 100,
        },
    });
    return response.data.items ?? [];
}
async function fetchVisibleJobs(context) {
    const api = createApiClient(context);
    const response = await api.get("/jobs", {
        params: {
            page: 0,
            size: 100,
        },
    });
    return response.data.items ?? [];
}
function readNumberArg(args, fieldName) {
    const value = args?.[fieldName];
    if (typeof value === "number") {
        return {
            ok: true,
            value,
        };
    }
    return {
        ok: false,
        result: {
            status: 400,
            body: {
                error: `${fieldName} must be a number.`,
            },
        },
    };
}
export async function resolveVisibleTempByName(message, context) {
    const temps = await fetchVisibleTemps(context);
    if (!temps.length) {
        return { status: "none" };
    }
    const messageNormalized = normalizeText(message);
    const quotedPhrases = extractQuotedPhrases(message);
    const firstNameCounts = new Map();
    const lastNameCounts = new Map();
    for (const temp of temps) {
        const first = normalizeText(temp.firstName);
        const last = normalizeText(temp.lastName);
        if (first) {
            firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
        }
        if (last) {
            lastNameCounts.set(last, (lastNameCounts.get(last) ?? 0) + 1);
        }
    }
    const exactFullNameMatches = [];
    const quotedMatches = [];
    const uniqueTokenMatches = [];
    for (const temp of temps) {
        const fullName = normalizeText(getTempDisplayName(temp));
        const first = normalizeText(temp.firstName);
        const last = normalizeText(temp.lastName);
        if (fullName && includesWholePhrase(messageNormalized, fullName)) {
            exactFullNameMatches.push(temp);
            continue;
        }
        const quotedMatch = quotedPhrases.some((phrase) => {
            if (!phrase) {
                return false;
            }
            return (fullName === phrase ||
                fullName.includes(phrase) ||
                phrase.includes(fullName));
        });
        if (quotedMatch) {
            quotedMatches.push(temp);
            continue;
        }
        const firstIsUnique = first && firstNameCounts.get(first) === 1;
        const lastIsUnique = last && lastNameCounts.get(last) === 1;
        if ((firstIsUnique && includesWholePhrase(messageNormalized, first)) ||
            (lastIsUnique && includesWholePhrase(messageNormalized, last))) {
            uniqueTokenMatches.push(temp);
        }
    }
    const exactUnique = uniqueById(exactFullNameMatches);
    if (exactUnique.length === 1) {
        return { status: "resolved", match: exactUnique[0] };
    }
    if (exactUnique.length > 1) {
        return { status: "ambiguous", matches: exactUnique.slice(0, 4) };
    }
    const quotedUnique = uniqueById(quotedMatches);
    if (quotedUnique.length === 1) {
        return { status: "resolved", match: quotedUnique[0] };
    }
    if (quotedUnique.length > 1) {
        return { status: "ambiguous", matches: quotedUnique.slice(0, 4) };
    }
    const tokenUnique = uniqueById(uniqueTokenMatches);
    if (tokenUnique.length === 1) {
        return { status: "resolved", match: tokenUnique[0] };
    }
    if (tokenUnique.length > 1) {
        return { status: "ambiguous", matches: tokenUnique.slice(0, 4) };
    }
    return { status: "none" };
}
export async function resolveVisibleJobByName(message, context) {
    const jobs = await fetchVisibleJobs(context);
    if (!jobs.length) {
        return { status: "none" };
    }
    const messageNormalized = normalizeText(message);
    const quotedPhrases = extractQuotedPhrases(message);
    const matches = [];
    for (const job of jobs) {
        const jobName = normalizeText(getJobDisplayName(job));
        if (!jobName) {
            continue;
        }
        if (includesWholePhrase(messageNormalized, jobName)) {
            matches.push(job);
            continue;
        }
        const quotedMatch = quotedPhrases.some((phrase) => {
            if (!phrase) {
                return false;
            }
            return (jobName === phrase ||
                jobName.includes(phrase) ||
                phrase.includes(jobName));
        });
        if (quotedMatch) {
            matches.push(job);
        }
    }
    const uniqueMatches = uniqueById(matches);
    if (uniqueMatches.length === 1) {
        return { status: "resolved", match: uniqueMatches[0] };
    }
    if (uniqueMatches.length > 1) {
        return { status: "ambiguous", matches: uniqueMatches.slice(0, 4) };
    }
    return { status: "none" };
}
export const handleToolCall = async (name, args, context) => {
    const api = createApiClient(context);
    if (name === "get_job_details") {
        const jobIdArg = readNumberArg(args, "jobId");
        if (!jobIdArg.ok) {
            return jobIdArg.result;
        }
        const jobId = jobIdArg.value;
        try {
            const response = await api.get(`/jobs/${jobId}`);
            return asTextResult(formatJobDetails(response.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "get_temp_details") {
        const tempIdArg = readNumberArg(args, "tempId");
        if (!tempIdArg.ok) {
            return tempIdArg.result;
        }
        const tempId = tempIdArg.value;
        try {
            const response = await api.get(`/temps/${tempId}`);
            return asTextResult(formatTempDetails(response.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "get_available_temps_for_job") {
        const jobIdArg = readNumberArg(args, "jobId");
        if (!jobIdArg.ok) {
            return jobIdArg.result;
        }
        const jobId = jobIdArg.value;
        try {
            const response = await api.get("/temps", {
                params: {
                    jobId,
                    sortBy: "jobcount",
                    sortDir: "asc",
                    page: 0,
                    size: 10,
                },
            });
            return asTextResult(formatAvailableTemps(jobId, response.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "suggest_best_temp_for_job") {
        const jobIdArg = readNumberArg(args, "jobId");
        if (!jobIdArg.ok) {
            return jobIdArg.result;
        }
        const jobId = jobIdArg.value;
        try {
            const [jobResponse, tempsResponse] = await Promise.all([
                api.get(`/jobs/${jobId}`),
                api.get("/temps", {
                    params: {
                        jobId,
                        sortBy: "jobcount",
                        sortDir: "asc",
                        page: 0,
                        size: 10,
                    },
                }),
            ]);
            return asTextResult(formatBestTempSuggestion(jobResponse.data, tempsResponse.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "explain_temp_availability_for_job") {
        const jobIdArg = readNumberArg(args, "jobId");
        if (!jobIdArg.ok) {
            return jobIdArg.result;
        }
        const tempIdArg = readNumberArg(args, "tempId");
        if (!tempIdArg.ok) {
            return tempIdArg.result;
        }
        const jobId = jobIdArg.value;
        const tempId = tempIdArg.value;
        try {
            const [jobResponse, tempResponse] = await Promise.all([
                api.get(`/jobs/${jobId}`),
                api.get(`/temps/${tempId}`),
            ]);
            return asTextResult(formatTempAvailabilityExplanation(jobResponse.data, tempResponse.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "assign_temp_to_job") {
        const jobIdArg = readNumberArg(args, "jobId");
        if (!jobIdArg.ok) {
            return jobIdArg.result;
        }
        const tempIdArg = readNumberArg(args, "tempId");
        if (!tempIdArg.ok) {
            return tempIdArg.result;
        }
        const jobId = jobIdArg.value;
        const tempId = tempIdArg.value;
        try {
            const [jobBeforeResponse, tempResponse] = await Promise.all([
                api.get(`/jobs/${jobId}`),
                api.get(`/temps/${tempId}`),
            ]);
            const response = await api.patch(`/jobs/${jobId}`, {
                tempId,
            });
            const assignedJob = response.data;
            return asTextResult(formatAssignmentSummary({
                ...jobBeforeResponse.data,
                temp: assignedJob.temp,
            }, tempResponse.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "unassign_temp_from_job") {
        const jobIdArg = readNumberArg(args, "jobId");
        if (!jobIdArg.ok) {
            return jobIdArg.result;
        }
        const jobId = jobIdArg.value;
        try {
            const jobBeforeResponse = await api.get(`/jobs/${jobId}`);
            const response = await api.patch(`/jobs/${jobId}`, {
                tempId: 0,
            });
            return asTextResult(formatUnassignmentSummary(response.data, jobBeforeResponse.data.temp));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    return {
        status: 404,
        body: {
            error: `Unknown tool: ${name}`,
        },
    };
};
