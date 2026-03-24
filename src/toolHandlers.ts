import axios from "axios";
import type {
  RequestContext,
  ToolArguments,
  ToolCallResult,
} from "./types.js";
import { config } from "./config.js";

function createApiClient(context?: RequestContext) {
  return axios.create({
    baseURL: config.jobsApiBaseUrl,
    withCredentials: true,
    headers: context?.cookieHeader
      ? {
          Cookie: context.cookieHeader,
        }
      : undefined,
  });
}

function toErrorResult(error: unknown): ToolCallResult {
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

export const handleToolCall = async (
  name?: string,
  args?: ToolArguments,
  context?: RequestContext,
): Promise<ToolCallResult> => {
  if (!name) {
    return {
      status: 400,
      body: {
        error: "Tool name is required.",
      },
    };
  }

  const api = createApiClient(context);

  if (name === "get_available_temps_for_job") {
    const jobId = args?.jobId;

    if (typeof jobId !== "number") {
      return {
        status: 400,
        body: {
          error: "jobId must be a number.",
        },
      };
    }

    try {
      const response = await api.get("/temps", {
        params: {
          jobId,
          sortBy: "jobCount",
          sortDir: "asc",
          page: 0,
          size: 100,
        },
      });

      return {
        status: 200,
        body: {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  }

  if (name === "assign_temp_to_job") {
    const jobId = args?.jobId;
    const tempId = args?.tempId;

    if (typeof jobId !== "number") {
      return {
        status: 400,
        body: {
          error: "jobId must be a number.",
        },
      };
    }

    if (typeof tempId !== "number") {
      return {
        status: 400,
        body: {
          error: "tempId must be a number.",
        },
      };
    }

    try {
      const response = await api.patch(`/jobs/${jobId}`, { tempId });

      return {
        status: 200,
        body: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Temp ${tempId} assigned to job ${jobId}.`,
                  job: response.data,
                },
                null,
                2,
              ),
            },
          ],
        },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  }

  if (name === "unassign_temp_from_job") {
    const jobId = args?.jobId;

    if (typeof jobId !== "number") {
      return {
        status: 400,
        body: {
          error: "jobId must be a number.",
        },
      };
    }

    try {
      const response = await api.patch(`/jobs/${jobId}`, { tempId: 0 });

      return {
        status: 200,
        body: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Temp unassigned from job ${jobId}.`,
                  job: response.data,
                },
                null,
                2,
              ),
            },
          ],
        },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  }

  return {
    status: 404,
    body: {
      error: `Unknown tool: ${name}`,
    },
  };
};