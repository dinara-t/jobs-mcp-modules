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
    lower.includes("this temp") ||
    (lower.startsWith("show ") && lower.endsWith(" details")) ||
    (lower.startsWith("tell me about ") && !lower.includes(" job")) ||
    (lower.startsWith("show ") && !lower.includes(" job") && lower.includes(" details"))
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

function makeSpecificJobClarifications(
  action: "details" | "available" | "best" | "unassign" | "assign",
  jobs: Array<{ id: number; name?: string; title?: string }>,
): ClarificationPrompt[] {
  return jobs.slice(0, 4).map((job) => {
    const labelBase = job.name ?? job.title ?? `Job ${job.id}`;

    if (action === "available") {
      return {
        id: `available-job-${job.id}`,
        label: `${labelBase} (Job ${job.id})`,
        message: `Show available temps for job ${job.id}`,
      };
    }

    if (action === "best") {
      return {
        id: `best-job-${job.id}`,
        label: `${labelBase} (Job ${job.id})`,
        message: `Suggest the best temp for job ${job.id}`,
      };
    }

    if (action === "unassign") {
      return {
        id: `unassign-job-${job.id}`,
        label: `${labelBase} (Job ${job.id})`,
        message: `Unassign from job ${job.id}`,
      };
    }

    if (action === "assign") {
      return {
        id: `assign-job-${job.id}`,
        label: `${labelBase} (Job ${job.id})`,
        message: `Assign them to job ${job.id}`,
      };
    }

    return {
      id: `details-job-${job.id}`,
      label: `${labelBase} (Job ${job.id})`,
      message: `Show job ${job.id} details`,
    };
  });
}

function makeSpecificTempClarifications(
  action: "details" | "availability" | "assign",
  temps: Array<{ id: number; firstName: string; lastName: string }>,
  jobId?: number | null,
): ClarificationPrompt[] {
  return temps.slice(0, 4).map((temp) => {
    const fullName = `${temp.firstName} ${temp.lastName}`.trim();

    if (action === "availability") {
      return {
        id: `availability-temp-${temp.id}`,
        label: `${fullName} (Temp ${temp.id})`,
        message:
          jobId != null
            ? `Can temp ${temp.id} take job ${jobId}?`
            : `Show temp ${temp.id} details`,
      };
    }

    if (action === "assign") {
      return {
        id: `assign-temp-${temp.id}`,
        label: `${fullName} (Temp ${temp.id})`,
        message:
          jobId != null ? `Assign temp ${temp.id} to job ${jobId}` : `Assign temp ${temp.id}`,
      };
    }

    return {
      id: `details-temp-${temp.id}`,
      label: `${fullName} (Temp ${temp.id})`,
      message: `Show temp ${temp.id} details`,
    };
  });
}

function getRequestedJobClarificationAction(lower: string) {
  if (asksForAvailableTemps(lower)) {
    return "available" as const;
  }

  if (asksForBestTemp(lower)) {
    return "best" as const;
  }

  if (asksForUnassign(lower)) {
    return "unassign" as const;
  }

  if (asksForAssign(lower)) {
    return "assign" as const;
  }

  return "details" as const;
}

function getRequestedTempClarificationAction(lower: string) {
  if (asksForAvailabilityExplanation(lower)) {
    return "availability" as const;
  }

  if (asksForAssign(lower)) {
    return "assign" as const;
  }

  return "details" as const;
}

function needsJob(lower: string): boolean {
  return (
    asksForAvailableTemps(lower) ||
    asksForBestTemp(lower) ||
    asksForJobDetails(lower) ||
    asksForAssign(lower) ||
    asksForUnassign(lower) ||
    asksForAvailabilityExplanation(lower)
  );
}

function needsTemp(lower: string): boolean {
  return (
    asksForTempDetails(lower) ||
    asksForAssign(lower) ||
    asksForAvailabilityExplanation(lower)
  );
}

export const handleChatMessage = async (
  message?: string,
  context?: RequestContext,
): Promise<ChatResult> => {
  if (!message || !message.trim()) {
    return fail(400, "message is required.");
  }

  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  const resolvedJob = resolveJobId(lower, context);
  const resolvedTemp = resolveTempId(lower, context);

  let jobId = resolvedJob.value;
  let tempId = resolvedTemp.value;

  if (jobId == null) {
    const jobResolution = await resolveVisibleJobByName(trimmed, context);

    if (jobResolution.status === "resolved") {
      jobId = jobResolution.match.id;
    } else if (jobResolution.status === "ambiguous" && needsJob(lower)) {
      const prompts = makeSpecificJobClarifications(
        getRequestedJobClarificationAction(lower),
        jobResolution.matches,
      );

      return ok(
        "I found more than one matching job name. Choose the one you meant.",
        {
          clarificationPrompts: prompts,
          resolvedEntities: baseResolvedEntities(
            null,
            tempId,
            resolvedJob.usedCurrentJobContext,
            resolvedTemp.usedLastSuggestedTempContext,
          ),
        },
      );
    }
  }

  if (tempId == null) {
    const tempResolution = await resolveVisibleTempByName(trimmed, context);

    if (tempResolution.status === "resolved") {
      tempId = tempResolution.match.id;
    } else if (tempResolution.status === "ambiguous" && needsTemp(lower)) {
      const prompts = makeSpecificTempClarifications(
        getRequestedTempClarificationAction(lower),
        tempResolution.matches,
        jobId,
      );

      return ok(
        "I found more than one matching temp name. Choose the person you meant.",
        {
          clarificationPrompts: prompts,
          resolvedEntities: baseResolvedEntities(
            jobId,
            null,
            resolvedJob.usedCurrentJobContext,
            resolvedTemp.usedLastSuggestedTempContext,
          ),
        },
      );
    }
  }

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
        "I need both a temp and a job to explain availability. You can give IDs, use a job page, ask about the temp I just suggested, or mention the person and job by name.",
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
        "I need a job to recommend the best temp. Ask from a job page, include a job ID, or mention the job name.",
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
        "I need a job to show available temps. Ask from a job page, include a job ID, or mention the job name.",
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
        "I need a job to show details. Ask from a job page, include a job ID, or mention the job name.",
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
        "I need a temp to show details. Include a temp ID, ask about the temp I just suggested, or mention the person by name.",
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
        "I need a job before I can assign anyone. Ask from a job page, include a job ID, or mention the job name.",
        {
          clarificationPrompts: makeJobClarifications(),
          resolvedEntities,
        },
      );
    }

    if (tempId == null) {
      return ok(
        "I need a temp before I can assign anyone. Include a temp ID, say 'Assign them' after I recommend a temp, or mention the person by name.",
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
        "I need a job before I can unassign anyone. Ask from a job page, include a job ID, or mention the job name.",
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
    "I can help with jobs, temps, recommendations, and assignments. You can use IDs, current page context, or visible names.",
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