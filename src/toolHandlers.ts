import axios from "axios";
import type {
  RequestContext,
  ToolArguments,
  ToolCallResult,
} from "./types.js";
import { config } from "./config.js";

type PageResponse<T> = {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

type TempSummary = {
  id: number;
  firstName: string;
  lastName: string;
};

type JobResponse = {
  id: number;
  name?: string;
  title?: string;
  startDate: string;
  endDate: string;
  temp?: TempSummary | null;
};

type TempResponse = {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  managerId?: number | null;
  jobCount?: number;
};

type TempWithJobsResponse = {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  managerId?: number | null;
  jobs: Array<{
    id: number;
    name: string;
    startDate: string;
    endDate: string;
  }>;
};

export type EntityResolution<T> =
  | {
      status: "none";
    }
  | {
      status: "resolved";
      match: T;
    }
  | {
      status: "ambiguous";
      matches: T[];
    };

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function createApiClient(context?: RequestContext) {
  const headers: Record<string, string> = {};

  if (context?.cookieHeader) {
    headers["Cookie"] = context.cookieHeader;
  }

  const csrfHeaderValue =
    context?.csrfHeaderValue ??
    getCookieValue(context?.cookieHeader, "XSRF-TOKEN");

  if (csrfHeaderValue) {
    headers["X-XSRF-TOKEN"] = csrfHeaderValue;
  }

  return axios.create({
    baseURL: config.jobsApiBaseUrl,
    withCredentials: true,
    headers,
  });
}

function toErrorResult(error: unknown): ToolCallResult {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as
      | { message?: string; error?: string }
      | undefined;

    return {
      status: error.response?.status ?? 500,
      body: {
        error:
          responseData?.message ||
          responseData?.error ||
          error.message ||
          "Jobs API request failed.",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Unknown error calling Jobs API.",
    },
  };
}

function asTextResult(text: string): ToolCallResult {
  return {
    status: 200,
    body: {
      content: [
        {
          type: "text",
          text,
        },
      ],
    },
  };
}

function getJobDisplayName(job: JobResponse): string {
  return (job.name ?? job.title ?? `Job ${job.id}`).trim();
}

function getTempDisplayName(
  temp: TempSummary | TempResponse | TempWithJobsResponse,
): string {
  return `${temp.firstName} ${temp.lastName}`.trim();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesWholePhrase(messageNormalized: string, phraseNormalized: string): boolean {
  if (!messageNormalized || !phraseNormalized) {
    return false;
  }

  return ` ${messageNormalized} `.includes(` ${phraseNormalized} `);
}

function uniqueById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  const results: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    results.push(item);
  }

  return results;
}

function extractQuotedPhrases(message: string): string[] {
  const matches = [...message.matchAll(/["']([^"']{2,})["']/g)];
  return matches
    .map((match) => normalizeText(match[1] ?? ""))
    .filter((value) => value.length >= 2);
}

async function fetchVisibleTemps(context?: RequestContext): Promise<TempResponse[]> {
  const api = createApiClient(context);
  const response = await api.get<PageResponse<TempResponse>>("/temps", {
    params: {
      page: 0,
      size: 100,
    },
  });

  return response.data.items ?? [];
}

async function fetchVisibleJobs(context?: RequestContext): Promise<JobResponse[]> {
  const api = createApiClient(context);
  const response = await api.get<PageResponse<JobResponse>>("/jobs", {
    params: {
      page: 0,
      size: 100,
    },
  });

  return response.data.items ?? [];
}

export async function resolveVisibleTempByName(
  message: string,
  context?: RequestContext,
): Promise<EntityResolution<TempResponse>> {
  const temps = await fetchVisibleTemps(context);
  if (!temps.length) {
    return { status: "none" };
  }

  const messageNormalized = normalizeText(message);
  const quotedPhrases = extractQuotedPhrases(message);

  const firstNameCounts = new Map<string, number>();
  const lastNameCounts = new Map<string, number>();

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

  const exactFullNameMatches: TempResponse[] = [];
  const quotedMatches: TempResponse[] = [];
  const uniqueTokenMatches: TempResponse[] = [];

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

      return (
        fullName.includes(phrase) ||
        (first && first.includes(phrase)) ||
        (last && last.includes(phrase))
      );
    });

    if (quotedMatch) {
      quotedMatches.push(temp);
      continue;
    }

    const uniqueFirstNameMatch =
      first.length >= 3 &&
      firstNameCounts.get(first) === 1 &&
      includesWholePhrase(messageNormalized, first);

    const uniqueLastNameMatch =
      last.length >= 3 &&
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

export async function resolveVisibleJobByName(
  message: string,
  context?: RequestContext,
): Promise<EntityResolution<JobResponse>> {
  const jobs = await fetchVisibleJobs(context);
  if (!jobs.length) {
    return { status: "none" };
  }

  const messageNormalized = normalizeText(message);
  const quotedPhrases = extractQuotedPhrases(message);

  const exactMatches: JobResponse[] = [];
  const quotedMatches: JobResponse[] = [];

  for (const job of jobs) {
    const jobName = normalizeText(getJobDisplayName(job));

    if (!jobName) {
      continue;
    }

    if (jobName.length >= 4 && includesWholePhrase(messageNormalized, jobName)) {
      exactMatches.push(job);
      continue;
    }

    const quotedMatch = quotedPhrases.some(
      (phrase) => phrase.length >= 4 && jobName.includes(phrase),
    );

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

function formatJobDetails(job: JobResponse): string {
  const assigned =
    job.temp != null
      ? `${getTempDisplayName(job.temp)} (ID ${job.temp.id})`
      : "Unassigned";

  return [
    `Job ${job.id}: ${getJobDisplayName(job)}`,
    `Start date: ${job.startDate}`,
    `End date: ${job.endDate}`,
    `Assigned temp: ${assigned}`,
  ].join("\n");
}

function formatTempDetails(temp: TempWithJobsResponse): string {
  const lines = [
    `Temp ${temp.id}: ${getTempDisplayName(temp)}`,
    `Email: ${temp.email ?? "—"}`,
    `Manager ID: ${temp.managerId ?? "—"}`,
  ];

  if (!temp.jobs.length) {
    lines.push("Assigned jobs: none");
    return lines.join("\n");
  }

  lines.push(`Assigned jobs (${temp.jobs.length}):`);
  for (const job of temp.jobs) {
    lines.push(`- Job ${job.id}: ${job.name} (${job.startDate} to ${job.endDate})`);
  }

  return lines.join("\n");
}

function formatAvailableTemps(
  jobId: number,
  tempsPage: PageResponse<TempResponse>,
): string {
  if (!tempsPage.items.length) {
    return `No available temps were found for job ${jobId}.`;
  }

  const lines = [
    `Available temps for job ${jobId} (${tempsPage.totalItems} found):`,
  ];

  for (const temp of tempsPage.items) {
    lines.push(
      `- Temp ${temp.id}: ${getTempDisplayName(temp)} — current jobs: ${temp.jobCount ?? 0}`,
    );
  }

  return lines.join("\n");
}

function formatBestTempSuggestion(
  job: JobResponse,
  tempsPage: PageResponse<TempResponse>,
): string {
  if (!tempsPage.items.length) {
    return `No available temps were found for job ${job.id} (${getJobDisplayName(job)}).`;
  }

  const best = tempsPage.items[0];
  const remaining = tempsPage.items.slice(1, 4);

  const lines = [
    `Best temp suggestion for job ${job.id} (${getJobDisplayName(job)}):`,
    `${getTempDisplayName(best)} (Temp ${best.id})`,
    `Reason: currently has the lowest visible workload with ${best.jobCount ?? 0} assigned job(s).`,
  ];

  if (remaining.length) {
    lines.push("Other available options:");
    for (const temp of remaining) {
      lines.push(
        `- Temp ${temp.id}: ${getTempDisplayName(temp)} — current jobs: ${temp.jobCount ?? 0}`,
      );
    }
  }

  return lines.join("\n");
}

function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && endA >= startB;
}

function formatTempAvailabilityExplanation(
  job: JobResponse,
  temp: TempWithJobsResponse,
): string {
  const targetJobName = getJobDisplayName(job);
  const tempName = getTempDisplayName(temp);

  const overlappingJobs = temp.jobs.filter((assignedJob) =>
    rangesOverlap(
      assignedJob.startDate,
      assignedJob.endDate,
      job.startDate,
      job.endDate,
    ),
  );

  if (!overlappingJobs.length) {
    return [
      `${tempName} (Temp ${temp.id}) is available for job ${job.id} (${targetJobName}).`,
      `Reason: there are no overlapping assigned jobs between ${job.startDate} and ${job.endDate}.`,
    ].join("\n");
  }

  const lines = [
    `${tempName} (Temp ${temp.id}) is not available for job ${job.id} (${targetJobName}).`,
    `Reason: the following assigned job(s) overlap with ${job.startDate} to ${job.endDate}:`,
  ];

  for (const assignedJob of overlappingJobs) {
    lines.push(
      `- Job ${assignedJob.id}: ${assignedJob.name} (${assignedJob.startDate} to ${assignedJob.endDate})`,
    );
  }

  return lines.join("\n");
}

export const handleToolCall = async (
  name?: string,
  args?: ToolArguments,
  context?: RequestContext,
): Promise<ToolCallResult> => {
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
      const response = await api.get<JobResponse>(`/jobs/${jobId}`);
      return asTextResult(formatJobDetails(response.data));
    } catch (error) {
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
      const response = await api.get<TempWithJobsResponse>(`/temps/${tempId}`);
      return asTextResult(formatTempDetails(response.data));
    } catch (error) {
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
      const response = await api.get<PageResponse<TempResponse>>("/temps", {
        params: {
          jobId,
          sortBy: "jobCount",
          sortDir: "asc",
          page: 0,
          size: 100,
        },
      });

      return asTextResult(formatAvailableTemps(jobId, response.data));
    } catch (error) {
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
        api.get<JobResponse>(`/jobs/${jobId}`),
        api.get<PageResponse<TempResponse>>("/temps", {
          params: {
            jobId,
            sortBy: "jobCount",
            sortDir: "asc",
            page: 0,
            size: 100,
          },
        }),
      ]);

      return asTextResult(
        formatBestTempSuggestion(jobResponse.data, tempsResponse.data),
      );
    } catch (error) {
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
        api.get<JobResponse>(`/jobs/${jobId}`),
        api.get<TempWithJobsResponse>(`/temps/${tempId}`),
      ]);

      return asTextResult(
        formatTempAvailabilityExplanation(jobResponse.data, tempResponse.data),
      );
    } catch (error) {
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
      const response = await api.patch<JobResponse>(`/jobs/${jobId}`, {
        tempId,
      });

      const job = response.data;
      return asTextResult(
        `Assigned ${job.temp ? `${getTempDisplayName(job.temp)} (Temp ${job.temp.id})` : `Temp ${tempId}`} to job ${job.id} (${getJobDisplayName(job)}).`,
      );
    } catch (error) {
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
      const response = await api.patch<JobResponse>(`/jobs/${jobId}`, {
        tempId: null,
      });

      const job = response.data;
      return asTextResult(
        `Removed the assigned temp from job ${job.id} (${getJobDisplayName(job)}).`,
      );
    } catch (error) {
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