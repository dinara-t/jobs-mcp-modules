export type ToolArguments = Record<string, unknown> | undefined;

export type ToolCallResult = {
  status: number;
  body: {
    error?: string;
    content?: Array<{
      type: string;
      text: string;
    }>;
  };
};

export type ChatContext = {
  currentJobId?: number | null;
  lastSuggestedTempId?: number | null;
};

export type PendingAction =
  | {
      type: "assign_temp_to_job";
      jobId: number;
      tempId: number;
      title: string;
      message: string;
      confirmLabel?: string;
    }
  | {
      type: "unassign_temp_from_job";
      jobId: number;
      title: string;
      message: string;
      confirmLabel?: string;
    };

export type AssistantAction =
  | {
      type: "send_message";
      label: string;
      message: string;
    }
  | {
      type: "confirm_pending_action";
      label: string;
    };

export type ClarificationPrompt = {
  id: string;
  label: string;
  message: string;
};

export type ResolvedEntities = {
  jobId?: number | null;
  tempId?: number | null;
  usedCurrentJobContext?: boolean;
  usedLastSuggestedTempContext?: boolean;
};

export type ChatResult = {
  status: number;
  body: {
    error?: string;
    reply?: string;
    pendingAction?: PendingAction;
    suggestedActions?: AssistantAction[];
    clarificationPrompts?: ClarificationPrompt[];
    resolvedEntities?: ResolvedEntities;
  };
};

export type RequestContext = {
  cookieHeader?: string;
  chatContext?: ChatContext;
};