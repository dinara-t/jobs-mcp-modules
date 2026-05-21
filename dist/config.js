import dotenv from "dotenv";
dotenv.config();
export const config = {
    port: Number(process.env.PORT) || 3000,
    jobsApiBaseUrl: process.env.JOBS_API_BASE_URL || "http://localhost:8080",
    uiOrigin: process.env.JOBS_UI_ORIGIN || "http://localhost:5173",
};
