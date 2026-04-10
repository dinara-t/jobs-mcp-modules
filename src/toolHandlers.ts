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

function createApiClient(context?: RequestContext) {
  return axios.create({
    baseURL: config.jobsApiBaseUrl,
    withCredentials: true,
    headers: context?.cookieHeader
      ? {
          Cookie: context.cookieHeader,
        }
      : undefined,
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
      const response = await api.patch<JobResponse>(`/jobs/${jobId}`, { tempId });

      return asTextResult(
        [
          `Assigned temp ${tempId} to job ${jobId}.`,
          formatJobDetails(response.data),
        ].join("\n\n"),
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
      const response = await api.patch<JobResponse>(`/jobs/${jobId}`, { tempId: 0 });

      return asTextResult(
        [
          `Removed the assigned temp from job ${jobId}.`,
          formatJobDetails(response.data),
        ].join("\n\n"),
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