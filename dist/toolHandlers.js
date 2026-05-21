import { createApiClient, toErrorResult } from "./apiClient.js";
import { asTextResult, formatAvailableTemps, formatBestTempSuggestion, formatJobDetails, formatTempAvailabilityExplanation, formatTempDetails, getJobDisplayName, getTempDisplayName, } from "./formatters.js";
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
            return (fullName.includes(phrase) ||
                (first && first.includes(phrase)) ||
                (last && last.includes(phrase)));
        });
        if (quotedMatch) {
            quotedMatches.push(temp);
            continue;
        }
        const uniqueFirstNameMatch = first.length >= 3 &&
            firstNameCounts.get(first) === 1 &&
            includesWholePhrase(messageNormalized, first);
        const uniqueLastNameMatch = last.length >= 3 &&
            lastNameCounts.get(last) === 1 &&
            includesWholePhrase(messageNormalized, last);
        if (uniqueFirstNameMatch || uniqueLastNameMatch) {
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
    const exactMatches = [];
    const quotedMatches = [];
    for (const job of jobs) {
        const jobName = normalizeText(getJobDisplayName(job));
        if (!jobName) {
            continue;
        }
        if (jobName.length >= 4 && includesWholePhrase(messageNormalized, jobName)) {
            exactMatches.push(job);
            continue;
        }
        const quotedMatch = quotedPhrases.some((phrase) => phrase.length >= 4 && jobName.includes(phrase));
        if (quotedMatch) {
            quotedMatches.push(job);
        }
    }
    const exactUnique = uniqueById(exactMatches);
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
    return { status: "none" };
}
export const handleToolCall = async (name, args, context) => {
    if (!name) {
        return {
            status: 400,
            body: {
                error: "Tool name is required.",
            },
        };
    }
    const api = createApiClient(context);
    if (name === "get_job_details") {
        const jobId = args?.jobId;
        if (typeof jobId !== "number") {
            return {
                status: 400,
                body: {
                    error: "jobId must be a number.",
                },
            };
        }
        try {
            const response = await api.get(`/jobs/${jobId}`);
            return asTextResult(formatJobDetails(response.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "get_temp_details") {
        const tempId = args?.tempId;
        if (typeof tempId !== "number") {
            return {
                status: 400,
                body: {
                    error: "tempId must be a number.",
                },
            };
        }
        try {
            const response = await api.get(`/temps/${tempId}`);
            return asTextResult(formatTempDetails(response.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "get_available_temps_for_job") {
        const jobId = args?.jobId;
        if (typeof jobId !== "number") {
            return {
                status: 400,
                body: {
                    error: "jobId must be a number.",
                },
            };
        }
        try {
            const response = await api.get("/temps", {
                params: {
                    jobId,
                    sortBy: "jobCount",
                    sortDir: "asc",
                    page: 0,
                    size: 100,
                },
            });
            return asTextResult(formatAvailableTemps(jobId, response.data));
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "suggest_best_temp_for_job") {
        const jobId = args?.jobId;
        if (typeof jobId !== "number") {
            return {
                status: 400,
                body: {
                    error: "jobId must be a number.",
                },
            };
        }
        try {
            const [jobResponse, tempsResponse] = await Promise.all([
                api.get(`/jobs/${jobId}`),
                api.get("/temps", {
                    params: {
                        jobId,
                        sortBy: "jobCount",
                        sortDir: "asc",
                        page: 0,
                        size: 100,
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
        const jobId = args?.jobId;
        const tempId = args?.tempId;
        if (typeof jobId !== "number") {
            return {
                status: 400,
                body: {
                    error: "jobId must be a number.",
                },
            };
        }
        if (typeof tempId !== "number") {
            return {
                status: 400,
                body: {
                    error: "tempId must be a number.",
                },
            };
        }
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
        const jobId = args?.jobId;
        const tempId = args?.tempId;
        if (typeof jobId !== "number") {
            return {
                status: 400,
                body: {
                    error: "jobId must be a number.",
                },
            };
        }
        if (typeof tempId !== "number") {
            return {
                status: 400,
                body: {
                    error: "tempId must be a number.",
                },
            };
        }
        try {
            const response = await api.patch(`/jobs/${jobId}`, {
                tempId,
            });
            const job = response.data;
            return asTextResult(`Assigned ${job.temp
                ? `${getTempDisplayName(job.temp)} (Temp ${job.temp.id})`
                : `Temp ${tempId}`} to job ${job.id} (${getJobDisplayName(job)}).`);
        }
        catch (error) {
            return toErrorResult(error);
        }
    }
    if (name === "unassign_temp_from_job") {
        const jobId = args?.jobId;
        if (typeof jobId !== "number") {
            return {
                status: 400,
                body: {
                    error: "jobId must be a number.",
                },
            };
        }
        try {
            const response = await api.patch(`/jobs/${jobId}`, {
                tempId: 0,
            });
            const job = response.data;
            return asTextResult(`Removed the assigned temp from job ${job.id} (${getJobDisplayName(job)}).`);
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
