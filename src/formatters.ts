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
  return job.name.trim() || `Job ${job.id}`;
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
  const workload = best.jobCount ?? 0;

  const lines = [
    `Best temp suggestion for job ${job.id} (${getJobDisplayName(job)}):`,
    `${getTempDisplayName(best)} (Temp ${best.id})`,
    "",
    "Why this is the strongest option:",
    `- Available for the full job date range: ${job.startDate} to ${job.endDate}`,
    `- Lowest visible workload among returned candidates: ${workload} assigned job(s)`,
    "- No overlapping booking was returned by the availability endpoint",
    "",
    "Confidence: High",
    "Reason: this recommendation is based on live availability filtering and current visible workload.",
  ];

  if (remaining.length) {
    lines.push("", "Other available options:");

    for (const temp of remaining) {
      lines.push(
        `- Temp ${temp.id}: ${getTempDisplayName(temp)} — current jobs: ${temp.jobCount ?? 0}`,
      );
    }
  }

  lines.push("", "Suggested next actions:");
  lines.push("- Assign them");
  lines.push("- Check why they can take this job");
  lines.push("- Show all available temps");

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
      `${tempName} (Temp ${temp.id}) can take job ${job.id} (${targetJobName}).`,
      "",
      "Availability check:",
      `- Job date range: ${job.startDate} to ${job.endDate}`,
      "- No overlapping assigned jobs found",
      `- Current visible workload: ${temp.jobs.length} assigned job(s)`,
      "",
      "Confidence: High",
      "Reason: this is based on the temp's current assigned jobs and the target job date range.",
    ].join("\n");
  }

  const lines = [
    `${tempName} (Temp ${temp.id}) cannot take job ${job.id} (${targetJobName}).`,
    "",
    "Availability issue:",
    `- Job date range: ${job.startDate} to ${job.endDate}`,
    "- One or more assigned jobs overlap with this date range",
    "",
    "Overlapping job(s):",
  ];

  for (const assignedJob of overlappingJobs) {
    lines.push(
      `- Job ${assignedJob.id}: ${assignedJob.name} (${assignedJob.startDate} to ${assignedJob.endDate})`,
    );
  }

  lines.push("", "Suggested next actions:");
  lines.push("- Show all available temps");
  lines.push("- Suggest the best temp for this job");

  return lines.join("\n");
}

export function formatAssignmentSummary(
  job: JobResponse,
  temp: TempWithJobsResponse | TempSummary,
): string {
  const tempName = getTempDisplayName(temp);
  const jobName = getJobDisplayName(job);
  const currentJobs = "jobs" in temp ? temp.jobs.length : null;

  const lines = [
    `${tempName} was assigned to Job ${job.id} (${jobName}).`,
    "",
    "Assignment summary:",
    `- Job date range: ${job.startDate} to ${job.endDate}`,
    `- Assigned temp: ${tempName} (Temp ${temp.id})`,
    "- API accepted the assignment, so no conflicting booking was detected",
  ];

  if (currentJobs != null) {
    lines.push(`- Current visible workload: ${currentJobs} assigned job(s)`);
  }

  lines.push("", "Suggested next actions:");
  lines.push("- Show job details");
  lines.push("- Show temp details");
  lines.push("- Find backup temps");

  return lines.join("\n");
}

export function formatUnassignmentSummary(
  job: JobResponse,
  previousTemp?: TempSummary | null,
): string {
  const jobName = getJobDisplayName(job);
  const previousTempText = previousTemp
    ? `${getTempDisplayName(previousTemp)} (Temp ${previousTemp.id})`
    : "the assigned temp";

  return [
    `${previousTempText} was removed from Job ${job.id} (${jobName}).`,
    "",
    "Unassignment summary:",
    `- Job date range: ${job.startDate} to ${job.endDate}`,
    "- Job is now unassigned",
    "",
    "Suggested next actions:",
    "- Suggest the best temp for this job",
    "- Show all available temps",
    "- Show job details",
  ].join("\n");
}