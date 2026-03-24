import { handleToolCall } from "./toolHandlers.js";
import type { ChatResult, RequestContext } from "./types.js";

export const handleChatMessage = async (
  message?: string,
  context?: RequestContext,
): Promise<ChatResult> => {
  if (!message || !message.trim()) {
    return {
      status: 400,
      body: {
        error: "message is required.",
      },
    };
  }

  const lower = message.toLowerCase();

  const jobMatch = lower.match(/\bjob\s+(\d+)\b/);
  const tempMatch = lower.match(/\btemp\s+(\d+)\b/);

  // ---------------------------
  // AVAILABLE TEMPS
  // ---------------------------
  if (
    (lower.includes("available") || lower.includes("who can take")) &&
    jobMatch
  ) {
    const jobId = Number(jobMatch[1]);

    const result = await handleToolCall(
      "get_available_temps_for_job",
      { jobId },
      context,
    );

    if (result.status !== 200) {
      return {
        status: result.status,
        body: { error: result.body.error ?? "Failed." },
      };
    }

    return {
      status: 200,
      body: {
        reply: `Here are available temps for job ${jobId}:\n${result.body.content?.[0]?.text}`,
      },
    };
  }

  // ---------------------------
  // ASSIGN
  // ---------------------------
  if (lower.includes("assign") && jobMatch && tempMatch) {
    const jobId = Number(jobMatch[1]);
    const tempId = Number(tempMatch[1]);

    const result = await handleToolCall(
      "assign_temp_to_job",
      { jobId, tempId },
      context,
    );

    if (result.status !== 200) {
      return {
        status: result.status,
        body: { error: result.body.error ?? "Failed." },
      };
    }

    return {
      status: 200,
      body: {
        reply: `✅ Temp ${tempId} successfully assigned to job ${jobId}`,
      },
    };
  }

  // ---------------------------
  // UNASSIGN
  // ---------------------------
  if (
    (lower.includes("unassign") || lower.includes("remove")) &&
    jobMatch
  ) {
    const jobId = Number(jobMatch[1]);

    const result = await handleToolCall(
      "unassign_temp_from_job",
      { jobId },
      context,
    );

    if (result.status !== 200) {
      return {
        status: result.status,
        body: { error: result.body.error ?? "Failed." },
      };
    }

    return {
      status: 200,
      body: {
        reply: `❌ Temp removed from job ${jobId}`,
      },
    };
  }

  // ---------------------------
  // FALLBACK
  // ---------------------------
  return {
    status: 200,
    body: {
      reply:
        "Try:\n- Show available temps for job 12\n- Assign temp 5 to job 12\n- Unassign temp from job 12",
    },
  };
};