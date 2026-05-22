import {
  handleToolCall,
  resolveVisibleJobByName,
  resolveVisibleTempByName,
} from "./toolHandlers.js";
import type {
  AssistantAction,
  ChatResult,
  RequestContext,
} from "./types.js";
import {
  buildAssignPendingAction,
  buildClarificationPromptsForJobs,
  buildClarificationPromptsForTemps,
  buildResolvedEntities,
  buildUnassignPendingAction,
  extractReplyTextFromToolResult,
  textReply,
} from "./chatActions.js";
import {
  extractJobId,
  extractTempId,
  isAssignIntent,
  isAvailabilityExplanationIntent,
  isAvailableTempsIntent,
  isBestTempIntent,
  isJobDetailsIntent,
  isTempDetailsIntent,
  isUnassignIntent,
  normalizeText,
} from "./chatText.js";

export async function handleChatMessage(
  message: string,
  context?: RequestContext,
): Promise<ChatResult> {
  const rawMessage = message.trim();
  const normalized = normalizeText(rawMessage);

  const currentJobId = context?.chatContext?.currentJobId ?? null;
  const lastSuggestedTempId = context?.chatContext?.lastSuggestedTempId ?? null;

  const confirmAssignMatch = rawMessage.match(
    /^__confirm_assign__\s+temp\s+(\d+)\s+to\s+job\s+(\d+)$/i,
  );

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
          reply: "I found more than one matching job name. Choose the one you meant.",
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
          message: "Can they take this job?",
        },
        {
          type: "send_message",
          label: "Show all available temps",
          message: "Show available temps for this job",
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

    const reply = extractReplyTextFromToolResult(result);
    const canAssign =
      result.status === 200 &&
      /\bcan take\b/i.test(reply) &&
      !/\bcannot take\b/i.test(reply);

    return {
      status: result.status,
      body: {
        reply,
        suggestedActions: canAssign
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

  if (isAvailabilityExplanationIntent(normalized)) {
    return {
      status: 200,
      body: {
        reply:
          "I need both a temp and a job to explain availability. Ask after a temp suggestion, or include both IDs.",
        suggestedActions: [],
        clarificationPrompts: [
          {
            id: "why-temp-5",
            label: "Why is temp 5 unavailable for this job?",
            message: "Why is temp 5 unavailable for this job?",
          },
          {
            id: "can-they-take",
            label: "Can they take this job?",
            message: "Can they take this job?",
          },
        ],
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
