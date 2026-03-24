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

export type ChatResult = {
  status: number;
  body: {
    error?: string;
    reply?: string;
  };
};

export type RequestContext = {
  cookieHeader?: string;
};