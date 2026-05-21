import axios from "axios";
import { config } from "./config.js";
function getCookieValue(cookieHeader, name) {
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
export function createApiClient(context) {
    const headers = {};
    if (context?.cookieHeader) {
        headers.Cookie = context.cookieHeader;
    }
    const csrfHeaderValue = context?.csrfHeaderValue ?? getCookieValue(context?.cookieHeader, "XSRF-TOKEN");
    if (csrfHeaderValue) {
        headers["X-XSRF-TOKEN"] = csrfHeaderValue;
    }
    return axios.create({
        baseURL: config.jobsApiBaseUrl,
        withCredentials: true,
        headers,
    });
}
export function toErrorResult(error) {
    if (axios.isAxiosError(error)) {
        const responseData = error.response?.data;
        return {
            status: error.response?.status ?? 500,
            body: {
                error: responseData?.message ||
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
