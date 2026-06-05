import axios from "axios";
import { config } from "./config.js";
import type { RequestContext, ToolCallResult } from "./types.js";

export type PageResponse<T> = {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type TempSummary = {
  id: number;
  firstName: string;
  lastName: string;
};

export type JobResponse = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  temp?: TempSummary | null;
};

export type TempResponse = {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  managerId?: number | null;
  jobCount?: number;
};

export type TempWithJobsResponse = {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  managerId?: number | null;
  jobs: Array<{
    id: number;
    name: string;
    startDate: string;
    endDate: string;
  }>;
};

export type EntityResolution<T> =
  | {
      status: "none";
    }
  | {
      status: "resolved";
      match: T;
    }
  | {
      status: "ambiguous";
      matches: T[];
    };

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}

function buildForwardedCookieHeader(context?: RequestContext): string | undefined {
  const originalCookieHeader = context?.cookieHeader?.trim();

  if (!originalCookieHeader) {
    if (context?.csrfHeaderValue) {
      return `XSRF-TOKEN=${context.csrfHeaderValue}`;
    }

    return undefined;
  }

  const existingXsrfCookie = getCookieValue(originalCookieHeader, "XSRF-TOKEN");

  if (existingXsrfCookie || !context?.csrfHeaderValue) {
    return originalCookieHeader;
  }

  return `${originalCookieHeader}; XSRF-TOKEN=${context.csrfHeaderValue}`;
}

export function createApiClient(context?: RequestContext) {
  const headers: Record<string, string> = {};
  const cookieHeader = buildForwardedCookieHeader(context);

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const csrfHeaderValue =
    context?.csrfHeaderValue ?? getCookieValue(cookieHeader, "XSRF-TOKEN");

  if (csrfHeaderValue) {
    headers["X-XSRF-TOKEN"] = csrfHeaderValue;
  }

  return axios.create({
    baseURL: config.jobsApiBaseUrl,
    headers,
    withCredentials: true,
  });
}

export function toErrorResult(error: unknown): ToolCallResult {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 500;
    const responseData = error.response?.data;

    if (typeof responseData === "string") {
      return {
        status,
        body: {
          error: responseData,
        },
      };
    }

    if (responseData && typeof responseData === "object") {
      const body = responseData as {
        message?: string;
        error?: string;
        reply?: string;
      };

      return {
        status,
        body: {
          error:
            body.message ??
            body.error ??
            body.reply ??
            error.message ??
            `Request failed with status ${status}`,
        },
      };
    }

    return {
      status,
      body: {
        error: error.message ?? `Request failed with status ${status}`,
      },
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        error: error.message,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Unknown error",
    },
  };
}