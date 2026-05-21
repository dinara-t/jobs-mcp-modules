import express from "express";
import cors from "cors";
import { tools } from "./tools.js";
import { handleToolCall } from "./toolHandlers.js";
import { handleChatMessage } from "./chat.js";
import { config } from "./config.js";
const app = express();
app.use(cors({
    origin: config.uiOrigin,
    credentials: true,
}));
app.use(express.json());
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "jobs-mcp-server",
        jobsApiBaseUrl: config.jobsApiBaseUrl,
        uiOrigin: config.uiOrigin,
    });
});
app.post("/tools/list", (_req, res) => {
    res.status(200).json({
        tools,
    });
});
app.post("/tools/call", async (req, res) => {
    const cookieHeader = req.headers.cookie;
    const csrfHeaderValue = req.headers["x-xsrf-token"] ??
        req.headers["x-csrf-token"];
    const body = req.body;
    const result = await handleToolCall(body.name, body.arguments, {
        cookieHeader,
        csrfHeaderValue,
    });
    return res.status(result.status).json(result.body);
});
app.post("/chat", async (req, res) => {
    const cookieHeader = req.headers.cookie;
    const csrfHeaderValue = req.headers["x-xsrf-token"] ??
        req.headers["x-csrf-token"];
    const body = req.body;
    const result = await handleChatMessage(body.message ?? "", {
        cookieHeader,
        csrfHeaderValue,
        chatContext: {
            currentJobId: body.context?.currentJobId ?? null,
            lastSuggestedTempId: body.context?.lastSuggestedTempId ?? null,
        },
    });
    return res.status(result.status).json(result.body);
});
app.listen(config.port, () => {
    console.log(`MCP server running on port ${config.port}`);
});
