import type {
  ChatResult,
  ClarificationPrompt,
  PendingAction,
  ResolvedEntities,
  ToolCallResult,
} from "./types.js";

export function textReply(text: string): ChatResult {
  return {
    status: 200,
    body: {
      reply: text,
      suggestedActions: [],
      clarificationPrompts: [],
    },
  };
}

export function buildResolvedEntities(
  jobId: number | null,
  tempId: number | null,
  options?: {
    usedCurrentJobContext?: boolean;
    usedLastSuggestedTempContext?: boolean;
  },
): ResolvedEntities {
  return {
    jobId,
    tempId,
    usedCurrentJobContext: options?.usedCurrentJobContext ?? false,
    usedLastSuggestedTempContext: options?.usedLastSuggestedTempContext ?? false,
  };
}

export function buildClarificationPromptsForTemps(
  matches: Array<{ id: number; firstName: string; lastName: string }>,
): ClarificationPrompt[] {
  return matches.map((temp) => ({
    id: `details-temp-${temp.id}`,
    label: `${temp.firstName} ${temp.lastName} (Temp ${temp.id})`,
    message: `Show temp ${temp.id} details`,
  }));
}

export function buildClarificationPromptsForJobs(
  matches: Array<{ id: number; name: string }>,
): ClarificationPrompt[] {
  return matches.map((job) => ({
    id: `available-job-${job.id}`,
    label: `${job.name.trim() || `Job ${job.id}`} (Job ${job.id})`,
    message: `Show available temps for job ${job.id}`,
  }));
}

export function buildAssignPendingAction(jobId: number, tempId: number): PendingAction {
  return {
    type: "assign_temp_to_job",
    jobId,
    tempId,
    title: "Assign temp",
    message: `Assign temp ${tempId} to job ${jobId}?`,
    confirmLabel: "Confirm assign",
  };
}

export function buildUnassignPendingAction(jobId: number): PendingAction {
  return {
    type: "unassign_temp_from_job",
    jobId,
    title: "Unassign temp",
    message: `Remove the current temp from job ${jobId}?`,
    confirmLabel: "Confirm unassign",
  };
}

export function extractReplyTextFromToolResult(result: ToolCallResult): string {
  if (result.body.content?.length) {
    const firstText = result.body.content.find((item) => item.type === "text");

    if (firstText?.text) {
      return firstText.text;
    }
  }

  return result.body.error ?? "No reply returned.";
}