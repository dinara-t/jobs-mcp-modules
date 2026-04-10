import { handleToolCall } from "./toolHandlers.js";
import type {
  AssistantAction,
  ChatResult,
  ClarificationPrompt,
  PendingAction,
  RequestContext,
  ResolvedEntities,
} from "./types.js";

function ok(
  reply: string,
  options?: {
    pendingAction?: PendingAction;
    suggestedActions?: AssistantAction[];
    clarificationPrompts?: ClarificationPrompt[];
    resolvedEntities?: ResolvedEntities;
  },
): ChatResult {
  return {
    status: 200,
    body: {
      reply,
      pendingAction: options?.pendingAction,
      suggestedActions: options?.suggestedActions ?? [],
      clarificationPrompts: options?.clarificationPrompts ?? [],
      resolvedEntities: options?.resolvedEntities,
    },
  };
}

function fail(status: number, error: string): ChatResult {
  return {
    status,
    body: { error },
  };
}

function extractJobId(lower: string): number | null {
  const match = lower.match(/\bjob\s+(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function extractTempId(lower: string): number | null {
  const match = lower.match(/\btemp\s+(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function asksForAvailableTemps(lower: string): boolean {
  return (
    lower.includes("available") ||
    lower.includes("who can take") ||
    lower.includes("who is free") ||
    lower.includes("show temps")
  );
}

function asksForBestTemp(lower: string): boolean {
  return (
    lower.includes("best temp") ||
    lower.includes("suggest") ||
    lower.includes("recommended") ||
    lower.includes("recommend")
  );
}

function asksForJobDetails(lower: string): boolean {
  return (
    lower.includes("job details") ||
    lower.includes("show job") ||
    lower.includes("tell me about job") ||
    lower.includes("this job") ||
    lower.includes("this one") ||
    lower.includes("job here") ||
    lower === "show details" ||
    lower === "show details for this job" ||
    lower.startsWith("job ")
  );
}

function asksForTempDetails(lower: string): boolean {
  return (
    lower.includes("temp details") ||
    lower.includes("show temp") ||
    lower.includes("tell me about temp") ||
    lower.includes("workload") ||
    lower.includes("that temp") ||
    lower.includes("this temp")
  );
}

function asksForAvailabilityExplanation(lower: string): boolean {
  return (
    lower.includes("why is temp") ||
    lower.includes("why temp") ||
    lower.includes("can temp") ||
    (lower.includes("is temp") && lower.includes("available")) ||
    lower.includes("explain availability") ||
    lower.includes("can they take") ||
    lower.includes("are they available") ||
    lower.includes("is that temp available")
  );
}

function asksForAssign(lower: string): boolean {
  return lower.includes("assign");
}

function asksForUnassign(lower: string): boolean {
  return lower.includes("unassign") || lower.includes("remove");
}

function refersToCurrentJob(lower: string): boolean {
  return (
    lower.includes("this job") ||
    lower.includes("job here") ||
    lower.includes("here") ||
    lower.includes("this one")
  );
}

function refersToLastSuggestedTemp(lower: string): boolean {
  return (
    lower.includes("them") ||
    lower.includes("that temp") ||
    lower.includes("this temp") ||
    lower.includes("recommended temp") ||
    lower.includes("best temp")
  );
}

function isConfirmAssign(lower: string): boolean {
  return lower.startsWith("__confirm_assign__");
}

function isConfirmUnassign(lower: string): boolean {
  return lower.startsWith("__confirm_unassign__");
}

function resolveJobId(lower: string, context?: RequestContext) {
  const explicitJobId = extractJobId(lower);
  if (explicitJobId != null) {
    return { value: explicitJobId, usedCurrentJobContext: false };
  }

  const currentJobId = context?.chatContext?.currentJobId;
  if (
    typeof currentJobId === "number" &&
    currentJobId > 0 &&
    (refersToCurrentJob(lower) ||
      asksForBestTemp(lower) ||
      asksForAvailableTemps(lower) ||
      asksForJobDetails(lower) ||
      asksForUnassign(lower) ||
      asksForAssign(lower) ||
      asksForAvailabilityExplanation(lower))
  ) {
    return { value: currentJobId, usedCurrentJobContext: true };
  }

  return { value: null, usedCurrentJobContext: false };
}

function resolveTempId(lower: string, context?: RequestContext) {
  const explicitTempId = extractTempId(lower);
  if (explicitTempId != null) {
    return { value: explicitTempId, usedLastSuggestedTempContext: false };
  }

  const lastSuggestedTempId = context?.chatContext?.lastSuggestedTempId;
  if (
    typeof lastSuggestedTempId === "number" &&
    lastSuggestedTempId > 0 &&
    (refersToLastSuggestedTemp(lower) ||
      (asksForAssign(lower) && !lower.includes("temp ")) ||
      (asksForAvailabilityExplanation(lower) && !lower.includes("temp ")))
  ) {
    return { value: lastSuggestedTempId, usedLastSuggestedTempContext: true };
  }

  return { value: null, usedLastSuggestedTempContext: false };
}

function baseResolvedEntities(
  jobId: number | null,
  tempId: number | null,
  usedCurrentJobContext: boolean,
  usedLastSuggestedTempContext: boolean,
): ResolvedEntities {
  return {
    jobId,
    tempId,
    usedCurrentJobContext,
    usedLastSuggestedTempContext,
  };
}

function makeJobClarifications(): ClarificationPrompt[] {
  return [
    {
      id: "job-details",
      label: "Show details for this job",
      message: "Show details for this job",
    },
    {
      id: "available-temps",
      label: "Show available temps for this job",
      message: "Show available temps for this job",
    },
    {
      id: "best-temp",
      label: "Suggest the best temp for this job",
      message: "Suggest the best temp for this job",
    },
  ];
}

function makeTempClarifications(): ClarificationPrompt[] {
  return [
    {
      id: "temp-5-details",
      label: "Show temp 5 details",
      message: "Show temp 5 details",
    },
    {
      id: "best-temp",
      label: "Suggest the best temp for this job",
      message: "Suggest the best temp for this job",
    },
  ];
}

export const handleChatMessage = async (
  message?: string,
  context?: RequestContext,
): Promise<ChatResult> => {
  if (!message || !message.trim()) {
    return fail(400, "message is required.");
  }

  const lower = message.trim().toLowerCase();
  const resolvedJob = resolveJobId(lower, context);
  const resolvedTemp = resolveTempId(lower, context);
  const jobId = resolvedJob.value;
  const tempId = resolvedTemp.value;
  const resolvedEntities = baseResolvedEntities(
    jobId,
    tempId,
    resolvedJob.usedCurrentJobContext,
    resolvedTemp.usedLastSuggestedTempContext,
  );

  if (isConfirmAssign(lower)) {
    if (jobId == null || tempId == null) {
      return fail(400, "Missing job ID or temp ID for confirm assign.");
    }

    const result = await handleToolCall(
      "assign_temp_to_job",
      { jobId, tempId },
      context,
    );

    if (result.status !== 200) {
      return fail(result.status, result.body.error ?? "Failed.");
    }

    return ok(result.body.content?.[0]?.text ?? "No reply returned.", {
      suggestedActions: [
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
      ],
      resolvedEntities,
    });
  }

  if (isConfirmUnassign(lower)) {
    if (jobId == null) {
      return fail(400, "Missing job ID for confirm unassign.");
    }

    const result = await handleToolCall(
      "unassign_temp_from_job",
      { jobId },
      context,
    );

    if (result.status !== 200) {
      return fail(result.status, result.body.error ?? "Failed.");
    }

    return ok(result.body.content?.[0]?.text ?? "No reply returned.", {
      suggestedActions: [
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
      ],
      resolvedEntities,
    });
  }

  if (asksForAvailabilityExplanation(lower)) {
    if (jobId == null || tempId == null) {
      return ok(
        "I need both a temp and a job to explain availability. You can give both IDs, ask from a job page, or ask about the temp I just suggested.",
        {
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
          resolvedEntities,
        },
      );
    }

    const result = await handleToolCall(
      "explain_temp_availability_for_job",
      { jobId, tempId },
      context,
    );

    if (result.status !== 200) {
      return fail(result.status, result.body.error ?? "Failed.");
    }

    return ok(result.body.content?.[0]?.text ?? "No reply returned.", {
      suggestedActions: [
        {
          type: "send_message",
          label: "Show temp details",
          message: `Show temp ${tempId} details`,
        },
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
      resolvedEntities,
    });
  }

  if (asksForBestTemp(lower)) {
    if (jobId == null) {
      return ok(
        "I need a job to recommend the best temp. Ask from a job page or include a job ID.",
        {
          clarificationPrompts: makeJobClarifications(),
          resolvedEntities,
        },
      );
    }

    const result = await handleToolCall(
      "suggest_best_temp_for_job",
      { jobId },
      context,
    );

    if (result.status !== 200) {
      return fail(result.status, result.body.error ?? "Failed.");
    }

    return ok(result.body.content?.[0]?.text ?? "No reply returned.", {
      suggestedActions: [
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
      ],
      resolvedEntities,
    });
  }

  if (asksForAvailableTemps(lower)) {
    if (jobId == null) {
      return ok(
        "I need a job to show available temps. Ask from a job page or include a job ID.",
        {
          clarificationPrompts: makeJobClarifications(),
          resolvedEntities,
        },
      );
    }

    const result = await handleToolCall(
      "get_available_temps_for_job",
      { jobId },
      context,
    );

    if (result.status !== 200) {
      return fail(result.status, result.body.error ?? "Failed.");
    }

    return ok(result.body.content?.[0]?.text ?? "No reply returned.", {
      suggestedActions: [
        {
          type: "send_message",
          label: "Suggest best temp",
          message: "Suggest the best temp for this job",
        },
        {
          type: "send_message",
          label: "Show job details",
          message: "Show details for this job",
        },
      ],
      resolvedEntities,
    });
  }

  if (asksForJobDetails(lower)) {
    if (jobId == null) {
      return ok(
        "I need a job to show details. Ask from a job page or include a job ID.",
        {
          clarificationPrompts: makeJobClarifications(),
          resolvedEntities,
        },
      );
    }

    const result = await handleToolCall(
      "get_job_details",
      { jobId },
      context,
    );

    if (result.status !== 200) {
      return fail(result.status, result.body.error ?? "Failed.");
    }

    return ok(result.body.content?.[0]?.text ?? "No reply returned.", {
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
        {
          type: "send_message",
          label: "Unassign temp",
          message: "Unassign from this job",
        },
      ],
      resolvedEntities,
    });
  }

  if (asksForTempDetails(lower)) {
    if (tempId == null) {
      return ok(
        "I need a temp to show details. Include a temp ID or ask about the temp I just suggested.",
        {
          clarificationPrompts: makeTempClarifications(),
          resolvedEntities,
        },
      );
    }

    const result = await handleToolCall(
      "get_temp_details",
      { tempId },
      context,
    );

    if (result.status !== 200) {
      return fail(result.status, result.body.error ?? "Failed.");
    }

    return ok(result.body.content?.[0]?.text ?? "No reply returned.", {
      suggestedActions: [
        {
          type: "send_message",
          label: "Can they take this job?",
          message: "Can they take this job?",
        },
        {
          type: "send_message",
          label: "Assign them",
          message: "Assign them",
        },
      ],
      resolvedEntities,
    });
  }

  if (asksForAssign(lower)) {
    if (jobId == null) {
      return ok(
        "I need a job before I can assign anyone. Ask from a job page or include a job ID.",
        {
          clarificationPrompts: makeJobClarifications(),
          resolvedEntities,
        },
      );
    }

    if (tempId == null) {
      return ok(
        "I need a temp before I can assign anyone. Include a temp ID or say 'Assign them' after I recommend a temp.",
        {
          clarificationPrompts: [
            {
              id: "assign-them",
              label: "Assign them",
              message: "Assign them",
            },
            {
              id: "best-temp",
              label: "Suggest the best temp",
              message: "Suggest the best temp for this job",
            },
          ],
          resolvedEntities,
        },
      );
    }

    return ok(
      `I can assign temp ${tempId} to job ${jobId}. Please confirm to continue.`,
      {
        pendingAction: {
          type: "assign_temp_to_job",
          jobId,
          tempId,
          title: "Assign temp",
          message: `Assign temp ${tempId} to job ${jobId}?`,
          confirmLabel: "Confirm assign",
        },
        suggestedActions: [
          {
            type: "confirm_pending_action",
            label: "Confirm assign",
          },
          {
            type: "send_message",
            label: "Show temp details",
            message: `Show temp ${tempId} details`,
          },
        ],
        resolvedEntities,
      },
    );
  }

  if (asksForUnassign(lower)) {
    if (jobId == null) {
      return ok(
        "I need a job before I can unassign anyone. Ask from a job page or include a job ID.",
        {
          clarificationPrompts: makeJobClarifications(),
          resolvedEntities,
        },
      );
    }

    return ok(
      `I can remove the assigned temp from job ${jobId}. Please confirm to continue.`,
      {
        pendingAction: {
          type: "unassign_temp_from_job",
          jobId,
          title: "Unassign temp",
          message: `Remove the assigned temp from job ${jobId}?`,
          confirmLabel: "Confirm unassign",
        },
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
        resolvedEntities,
      },
    );
  }

  return ok(
    "I can help with jobs, temps, recommendations, and assignments. Choose one of these to get started.",
    {
      clarificationPrompts: [
        {
          id: "show-job-details",
          label: "Show details for this job",
          message: "Show details for this job",
        },
        {
          id: "available-temps",
          label: "Show available temps",
          message: "Show available temps for this job",
        },
        {
          id: "best-temp",
          label: "Suggest best temp",
          message: "Suggest the best temp for this job",
        },
      ],
      resolvedEntities,
    },
  );
};