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
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

export function createApiClient(context?: RequestContext) {
  const headers: Record<string, string> = {};

  if (context?.cookieHeader) {
    headers.Cookie = context.cookieHeader;
  }

  const csrfHeaderValue =
    context?.csrfHeaderValue ?? getCookieValue(context?.cookieHeader, "XSRF-TOKEN");

  if (csrfHeaderValue) {
    headers["X-XSRF-TOKEN"] = csrfHeaderValue;
  }

  return axios.create({
    baseURL: config.jobsApiBaseUrl,
    withCredentials: true,
    headers,
  });
}

export function toErrorResult(error: unknown): ToolCallResult {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as
      | { message?: string; error?: string }
      | undefined;

    return {
      status: error.response?.status ?? 500,
      body: {
        error:
          responseData?.message ||
          responseData?.error ||
          error.message ||
          "Jobs API request failed.",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Unknown error calling Jobs API.",
    },
  };
}