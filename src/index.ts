import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { tools } from "./tools.js";
import { handleToolCall } from "./toolHandlers.js";
import { handleChatMessage } from "./chat.js";
import { config } from "./config.js";
import type { ChatContext } from "./types.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: config.uiOrigin,
    credentials: true,
  }),
);

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
  const body = (req.body ?? {}) as {
    name?: string;
    arguments?: Record<string, unknown>;
  };

  const cookieHeader = req.headers.cookie;

  console.log("Incoming MCP /tools/call cookie header:", cookieHeader);

  const context = {
    cookieHeader,
  };

  const result = await handleToolCall(body.name, body.arguments, context);
  return res.status(result.status).json(result.body);
});

app.post("/chat", async (req, res) => {
  const body = (req.body ?? {}) as {
    message?: string;
    context?: ChatContext;
  };

  const cookieHeader = req.headers.cookie;

  console.log("Incoming MCP /chat cookie header:", cookieHeader);

  const context = {
    cookieHeader,
    chatContext: body.context,
  };

  const result = await handleChatMessage(body.message, context);
  return res.status(result.status).json(result.body);
});

app.listen(config.port, () => {
  console.log(`MCP server running on port ${config.port}`);
});