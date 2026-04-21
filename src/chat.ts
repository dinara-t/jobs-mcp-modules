import {
  handleToolCall,
  resolveVisibleJobByName,
  resolveVisibleTempByName,
} from "./toolHandlers.js";
import type {
  AssistantAction,
  ChatResult,
  ClarificationPrompt,
  PendingAction,
  RequestContext,
  ResolvedEntities,
} from "./types.js";

function textReply(text: string): ChatResult {
  return {
    status: 200,
    body: {
      reply: text,
      suggestedActions: [],
      clarificationPrompts: [],
    },
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJobId(message: string): number | null {
  const match = message.match(/\bjob\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function extractTempId(message: string): number | null {
  const match = message.match(/\btemp\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function isAssignIntent(normalized: string): boolean {
  return (
    normalized.includes("assign") ||
    normalized.includes("put them on") ||
    normalized.includes("put temp") ||
    normalized.includes("book them")
  );
}

function isUnassignIntent(normalized: string): boolean {
  return (
    normalized.includes("unassign") ||
    normalized.includes("remove them") ||
    normalized.includes("remove temp") ||
    normalized.includes("clear assignment") ||
    normalized.includes("take them off")
  );
}

function isJobDetailsIntent(normalized: string): boolean {
  return (
    normalized.includes("show details for this job") ||
    normalized.includes("show job details") ||
    normalized.includes("job details") ||
    normalized.includes("show details for job")
  );
}

function isTempDetailsIntent(normalized: string): boolean {
  return (
    normalized.includes("show temp") && normalized.includes("details")
  );
}

function isAvailableTempsIntent(normalized: string): boolean {
  return (
    normalized.includes("show available temps") ||
    normalized.includes("available temps") ||
    normalized.includes("who is available")
  );
}

function isBestTempIntent(normalized: string): boolean {
  return (
    normalized.includes("suggest the best temp") ||
    normalized.includes("best temp") ||
    normalized.includes("who should take this")
  );
}

function isAvailabilityExplanationIntent(normalized: string): boolean {
  return (
    normalized.includes("why is temp") ||
    normalized.includes("why are they unavailable") ||
    normalized.includes("can they take this job") ||
    normalized.includes("why unavailable")
  );
}

function buildResolvedEntities(
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

function buildClarificationPromptsForTemps(
  matches: Array<{ id: number; firstName: string; lastName: string }>,
): ClarificationPrompt[] {
  return matches.map((temp) => ({
    id: `temp-${temp.id}`,
    label: `${temp.firstName} ${temp.lastName} (Temp ${temp.id})`,
    message: `Show temp ${temp.id} details`,
  }));
}

function buildClarificationPromptsForJobs(
  matches: Array<{ id: number; name?: string; title?: string }>,
): ClarificationPrompt[] {
  return matches.map((job) => ({
    id: `job-${job.id}`,
    label: `${job.name ?? job.title ?? `Job ${job.id}`} (Job ${job.id})`,
    message: `Show job ${job.id} details`,
  }));
}

function buildAssignPendingAction(jobId: number, tempId: number): PendingAction {
  return {
    type: "assign_temp_to_job",
    jobId,
    tempId,
    title: "Assign temp",
    message: `Assign temp ${tempId} to job ${jobId}?`,
    confirmLabel: "Confirm assign",
  };
}

function buildUnassignPendingAction(jobId: number): PendingAction {
  return {
    type: "unassign_temp_from_job",
    jobId,
    title: "Unassign temp",
    message: `Remove the current temp from job ${jobId}?`,
    confirmLabel: "Confirm unassign",
  };
}

function extractReplyTextFromToolResult(result: Awaited<ReturnType<typeof handleToolCall>>): string {
  if (result.body.content?.length) {
    const firstText = result.body.content.find((item) => item.type === "text");
    if (firstText?.text) {
      return firstText.text;
    }
  }

  return result.body.error ?? "No reply returned.";
}

export async function handleChatMessage(
  message: string,
  context?: RequestContext,
): Promise<ChatResult> {
  const rawMessage = message.trim();
  const normalized = normalizeText(rawMessage);

  const currentJobId = context?.chatContext?.currentJobId ?? null;
  const lastSuggestedTempId = context?.chatContext?.lastSuggestedTempId ?? null;

  const confirmAssignMatch = rawMessage.match(/^__confirm_assign__\s+temp\s+(\d+)\s+to\s+job\s+(\d+)$/i);
  if (confirmAssignMatch) {
    const tempId = Number(confirmAssignMatch[1]);
    const jobId = Number(confirmAssignMatch[2]);

    const result = await handleToolCall(
      "assign_temp_to_job",
      { jobId, tempId },
      context,
    );

    return {
      status: result.status,
      body: {
        reply: extractReplyTextFromToolResult(result),
        suggestedActions:
          result.status === 200
            ? [
                {
                  type: "send_message",
                  label: "Show job details",
                  message: "Show details for this job",
                },
                {
                  type: "send_message",
                  label: "Show temp details",
                  message: `Show temp ${tempId} details`,
                },
              ]
            : [],
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(jobId, tempId, {
          usedCurrentJobContext: currentJobId === jobId,
          usedLastSuggestedTempContext: lastSuggestedTempId === tempId,
        }),
      },
    };
  }

  const confirmUnassignMatch = rawMessage.match(/^__confirm_unassign__\s+job\s+(\d+)$/i);
  if (confirmUnassignMatch) {
    const jobId = Number(confirmUnassignMatch[1]);

    const result = await handleToolCall(
      "unassign_temp_from_job",
      { jobId },
      context,
    );

    return {
      status: result.status,
      body: {
        reply: extractReplyTextFromToolResult(result),
        suggestedActions:
          result.status === 200
            ? [
                {
                  type: "send_message",
                  label: "Show job details",
                  message: "Show details for this job",
                },
                {
                  type: "send_message",
                  label: "Show available temps",
                  message: "Show available temps for this job",
                },
              ]
            : [],
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(jobId, null, {
          usedCurrentJobContext: currentJobId === jobId,
          usedLastSuggestedTempContext: false,
        }),
      },
    };
  }

  let resolvedJobId = extractJobId(rawMessage);
  let resolvedTempId = extractTempId(rawMessage);

  let usedCurrentJobContext = false;
  let usedLastSuggestedTempContext = false;

  if (resolvedJobId == null && currentJobId != null && normalized.includes("this job")) {
    resolvedJobId = currentJobId;
    usedCurrentJobContext = true;
  }

  if (resolvedJobId == null && currentJobId != null) {
    const jobIntentWithoutExplicitJob =
      isAssignIntent(normalized) ||
      isUnassignIntent(normalized) ||
      isJobDetailsIntent(normalized) ||
      isAvailableTempsIntent(normalized) ||
      isBestTempIntent(normalized) ||
      isAvailabilityExplanationIntent(normalized);

    if (jobIntentWithoutExplicitJob) {
      resolvedJobId = currentJobId;
      usedCurrentJobContext = true;
    }
  }

  if (resolvedTempId == null && lastSuggestedTempId != null && /\bthem\b/i.test(rawMessage)) {
    resolvedTempId = lastSuggestedTempId;
    usedLastSuggestedTempContext = true;
  }

  if (resolvedTempId == null) {
    const tempResolution = await resolveVisibleTempByName(rawMessage, context);

    if (tempResolution.status === "resolved") {
      resolvedTempId = tempResolution.match.id;
    }

    if (tempResolution.status === "ambiguous") {
      return {
        status: 200,
        body: {
          reply: "I found more than one matching temp name. Choose the person you meant.",
          suggestedActions: [],
          clarificationPrompts: buildClarificationPromptsForTemps(tempResolution.matches),
          resolvedEntities: buildResolvedEntities(resolvedJobId, null, {
            usedCurrentJobContext,
            usedLastSuggestedTempContext,
          }),
        },
      };
    }
  }

  if (resolvedJobId == null) {
    const jobResolution = await resolveVisibleJobByName(rawMessage, context);

    if (jobResolution.status === "resolved") {
      resolvedJobId = jobResolution.match.id;
    }

    if (jobResolution.status === "ambiguous") {
      return {
        status: 200,
        body: {
          reply: "I found more than one matching job name. Choose the job you meant.",
          suggestedActions: [],
          clarificationPrompts: buildClarificationPromptsForJobs(jobResolution.matches),
          resolvedEntities: buildResolvedEntities(null, resolvedTempId, {
            usedCurrentJobContext,
            usedLastSuggestedTempContext,
          }),
        },
      };
    }
  }

  if (isUnassignIntent(normalized)) {
    if (resolvedJobId == null) {
      return {
        status: 200,
        body: {
          reply: "Tell me which job you want to unassign from.",
          suggestedActions: [],
          clarificationPrompts: [],
          resolvedEntities: buildResolvedEntities(null, resolvedTempId, {
            usedCurrentJobContext,
            usedLastSuggestedTempContext,
          }),
        },
      };
    }

    return {
      status: 200,
      body: {
        reply: `I can remove the current temp from job ${resolvedJobId}. Please confirm to continue.`,
        pendingAction: buildUnassignPendingAction(resolvedJobId),
        suggestedActions: [
          {
            type: "confirm_pending_action",
            label: "Confirm unassign",
          },
          {
            type: "send_message",
            label: "Show job details",
            message: "Show details for this job",
          },
        ],
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(resolvedJobId, null, {
          usedCurrentJobContext,
          usedLastSuggestedTempContext: false,
        }),
      },
    };
  }

  if (isAssignIntent(normalized)) {
    if (resolvedJobId == null) {
      return {
        status: 200,
        body: {
          reply: "Tell me which job you want to assign someone to.",
          suggestedActions: [],
          clarificationPrompts: [],
          resolvedEntities: buildResolvedEntities(null, resolvedTempId, {
            usedCurrentJobContext,
            usedLastSuggestedTempContext,
          }),
        },
      };
    }

    if (resolvedTempId == null) {
      return {
        status: 200,
        body: {
          reply:
            "I need a temp before I can assign anyone. Include a temp ID, say 'Assign them' after I recommend a temp, or mention the person by name.",
          suggestedActions: [
            {
              type: "send_message",
              label: "Show available temps",
              message: "Show available temps for this job",
            },
            {
              type: "send_message",
              label: "Suggest best temp",
              message: "Suggest the best temp for this job",
            },
          ],
          clarificationPrompts: [],
          resolvedEntities: buildResolvedEntities(resolvedJobId, null, {
            usedCurrentJobContext,
            usedLastSuggestedTempContext,
          }),
        },
      };
    }

    return {
      status: 200,
      body: {
        reply: `I can assign temp ${resolvedTempId} to job ${resolvedJobId}. Please confirm to continue.`,
        pendingAction: buildAssignPendingAction(resolvedJobId, resolvedTempId),
        suggestedActions: [
          {
            type: "confirm_pending_action",
            label: "Confirm assign",
          },
          {
            type: "send_message",
            label: "Show temp details",
            message: `Show temp ${resolvedTempId} details`,
          },
        ],
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(resolvedJobId, resolvedTempId, {
          usedCurrentJobContext,
          usedLastSuggestedTempContext,
        }),
      },
    };
  }

  if (isJobDetailsIntent(normalized) && resolvedJobId != null) {
    const result = await handleToolCall("get_job_details", { jobId: resolvedJobId }, context);

    return {
      status: result.status,
      body: {
        reply: extractReplyTextFromToolResult(result),
        suggestedActions:
          result.status === 200
            ? [
                {
                  type: "send_message",
                  label: "Show available temps",
                  message: "Show available temps for this job",
                },
                {
                  type: "send_message",
                  label: "Suggest best temp",
                  message: "Suggest the best temp for this job",
                },
              ]
            : [],
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(resolvedJobId, null, {
          usedCurrentJobContext,
          usedLastSuggestedTempContext,
        }),
      },
    };
  }

  if (isTempDetailsIntent(normalized) && resolvedTempId != null) {
    const result = await handleToolCall("get_temp_details", { tempId: resolvedTempId }, context);

    return {
      status: result.status,
      body: {
        reply: extractReplyTextFromToolResult(result),
        suggestedActions: [],
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(resolvedJobId, resolvedTempId, {
          usedCurrentJobContext,
          usedLastSuggestedTempContext,
        }),
      },
    };
  }

  if (isAvailableTempsIntent(normalized) && resolvedJobId != null) {
    const result = await handleToolCall(
      "get_available_temps_for_job",
      { jobId: resolvedJobId },
      context,
    );

    return {
      status: result.status,
      body: {
        reply: extractReplyTextFromToolResult(result),
        suggestedActions:
          result.status === 200
            ? [
                {
                  type: "send_message",
                  label: "Suggest best temp",
                  message: "Suggest the best temp for this job",
                },
              ]
            : [],
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(resolvedJobId, null, {
          usedCurrentJobContext,
          usedLastSuggestedTempContext,
        }),
      },
    };
  }

  if (isBestTempIntent(normalized) && resolvedJobId != null) {
    const result = await handleToolCall(
      "suggest_best_temp_for_job",
      { jobId: resolvedJobId },
      context,
    );

    const reply = extractReplyTextFromToolResult(result);
    const suggestedTempMatch = reply.match(/\bTemp\s+(\d+)\b/i);
    const suggestedTempId = suggestedTempMatch ? Number(suggestedTempMatch[1]) : null;

    const suggestedActions: AssistantAction[] = [];
    if (result.status === 200 && suggestedTempId != null) {
      suggestedActions.push(
        {
          type: "send_message",
          label: "Assign them",
          message: "Assign them",
        },
        {
          type: "send_message",
          label: "Why are they available?",
          message: `Why is temp ${suggestedTempId} unavailable for this job?`,
        },
      );
    }

    return {
      status: result.status,
      body: {
        reply,
        suggestedActions,
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(resolvedJobId, suggestedTempId, {
          usedCurrentJobContext,
          usedLastSuggestedTempContext,
        }),
      },
    };
  }

  if (isAvailabilityExplanationIntent(normalized) && resolvedJobId != null && resolvedTempId != null) {
    const result = await handleToolCall(
      "explain_temp_availability_for_job",
      { jobId: resolvedJobId, tempId: resolvedTempId },
      context,
    );

    return {
      status: result.status,
      body: {
        reply: extractReplyTextFromToolResult(result),
        suggestedActions:
          result.status === 200
            ? [
                {
                  type: "send_message",
                  label: "Assign them",
                  message: "Assign them",
                },
              ]
            : [],
        clarificationPrompts: [],
        resolvedEntities: buildResolvedEntities(resolvedJobId, resolvedTempId, {
          usedCurrentJobContext,
          usedLastSuggestedTempContext,
        }),
      },
    };
  }

  return textReply(
    currentJobId != null
      ? "Try asking about this job, available temps, the best temp suggestion, assigning someone, or unassigning the current temp."
      : "Try asking for a job, a temp, available temps for a job, the best temp for a job, or assignment help.",
  );
}