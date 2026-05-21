import type {
  JobResponse,
  PageResponse,
  TempResponse,
  TempSummary,
  TempWithJobsResponse,
} from "./apiClient.js";
import type { ToolCallResult } from "./types.js";

export function asTextResult(text: string): ToolCallResult {
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

export function getJobDisplayName(job: JobResponse): string {
  return (job.name ?? job.title ?? `Job ${job.id}`).trim();
}

export function getTempDisplayName(
  temp: TempSummary | TempResponse | TempWithJobsResponse,
): string {
  return `${temp.firstName} ${temp.lastName}`.trim();
}

export function formatJobDetails(job: JobResponse): string {
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

export function formatTempDetails(temp: TempWithJobsResponse): string {
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

export function formatAvailableTemps(
  jobId: number,
  tempsPage: PageResponse<TempResponse>,
): string {
  if (!tempsPage.items.length) {
    return `No available temps were found for job ${jobId}.`;
  }

  const lines = [`Available temps for job ${jobId} (${tempsPage.totalItems} found):`];

  for (const temp of tempsPage.items) {
    lines.push(
      `- Temp ${temp.id}: ${getTempDisplayName(temp)} — current jobs: ${temp.jobCount ?? 0}`,
    );
  }

  return lines.join("\n");
}

export function formatBestTempSuggestion(
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

export function formatTempAvailabilityExplanation(
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