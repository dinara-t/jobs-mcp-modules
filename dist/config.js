import dotenv from "dotenv";
dotenv.config();
function isProduction() {
    return process.env.NODE_ENV === "production";
}
function readRequiredEnv(name, fallback) {
    const value = process.env[name]?.trim();
    if (value) {
        return value;
    }
    if (!isProduction()) {
        return fallback;
    }
    throw new Error(`${name} must be configured in production.`);
}
function readPort() {
    const rawPort = process.env.PORT?.trim();
    if (!rawPort) {
        return 3000;
    }
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error("PORT must be a positive integer.");
    }
    return port;
}
export const config = {
    port: readPort(),
    jobsApiBaseUrl: readRequiredEnv("JOBS_API_BASE_URL", "http://localhost:8080"),
    uiOrigin: readRequiredEnv("JOBS_UI_ORIGIN", "http://localhost:5173"),
};
