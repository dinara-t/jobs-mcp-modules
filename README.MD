# Jobs MCP Server

Express + TypeScript server that powers the Jobs Application assistant. It exposes tool endpoints and a chat endpoint, then calls the Jobs API using the logged-in user's cookies and CSRF token.

## Tech stack

- Node.js
- TypeScript
- Express 5
- Axios
- CORS
- dotenv
- Vitest
- tsx for local development

## Main responsibilities

- Expose assistant tools through `/tools/list` and `/tools/call`.
- Expose chat interaction through `/chat`.
- Forward browser cookies to the Jobs API.
- Forward CSRF headers to the Jobs API.
- Resolve job and temp names from visible API results.
- Return clarification prompts when a name match is ambiguous.
- Return structured pending actions for assignment and unassignment.
- Keep business rules inside the API while the MCP server handles assistant interpretation and tool orchestration.

## Prerequisites

- Node.js 18 or newer
- Jobs API running on `http://localhost:8080`
- Jobs UI running on `http://localhost:5173`

## Environment variables

Create a `.env` file in the MCP project root:

```properties
PORT=3000
JOBS_API_BASE_URL=http://localhost:8080
JOBS_UI_ORIGIN=http://localhost:5173
```

## Install and run

From the MCP server project folder:

```bash
npm install
npm run dev
```

The MCP server runs on:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev
npm run build
npm start
npm test
npm run test:watch
```

## HTTP endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Returns server status and configured API/UI origins |
| `POST` | `/tools/list` | Returns the available assistant tools |
| `POST` | `/tools/call` | Calls one assistant tool directly |
| `POST` | `/chat` | Handles a natural-language assistant message |

## Available tools

| Tool | Purpose |
|---|---|
| `get_job_details` | Returns job details for a job ID |
| `get_temp_details` | Returns temp details and assigned jobs for a temp ID |
| `get_available_temps_for_job` | Lists temps available for a job |
| `suggest_best_temp_for_job` | Suggests the lowest-workload available temp |
| `explain_temp_availability_for_job` | Explains whether a temp can take a job |
| `assign_temp_to_job` | Assigns a temp to a job |
| `unassign_temp_from_job` | Removes the assigned temp from a job |

## Chat endpoint

```http
POST /chat
```

Request body:

```json
{
  "message": "suggest the best temp for this job",
  "context": {
    "currentJobId": 12,
    "lastSuggestedTempId": null
  }
}
```

Successful response shape:

```json
{
  "reply": "Best available temp for job #12 is Alex Taylor, temp #5.",
  "suggestedActions": [],
  "clarificationPrompts": [],
  "pendingAction": null,
  "resolvedEntities": {
    "jobId": 12,
    "tempId": 5,
    "usedCurrentJobContext": true,
    "usedLastSuggestedTempContext": false
  }
}
```

## Tool call endpoint

```http
POST /tools/call
```

Request body:

```json
{
  "name": "assign_temp_to_job",
  "arguments": {
    "jobId": 12,
    "tempId": 5
  }
}
```

## Auth and CSRF forwarding

The MCP server does not create its own login session. It relies on the UI browser session.

For protected Jobs API calls, the MCP server forwards:

- The incoming `Cookie` header.
- The incoming `X-XSRF-TOKEN` or `X-CSRF-TOKEN` header.
- If no explicit CSRF header is supplied, it attempts to read `XSRF-TOKEN` from the cookie header and send it as `X-XSRF-TOKEN`.

This keeps API security consistent while still allowing the assistant to perform protected actions.

## Testing

Run:

```bash
npm test
```

The tests cover assistant interpretation, context usage, ambiguity handling, pending action confirmation, and tool delegation.

## Troubleshooting

### MCP health check works but chat fails

Check that `JOBS_API_BASE_URL` is correct and that the API is running.

### Tool actions return 401

Log in through the UI first. The MCP server needs the browser's JWT cookie.

### Tool actions return 403

Check that the UI forwards the CSRF header to MCP and that MCP forwards it to the API.

### Assistant chooses the wrong entity

Use explicit job IDs or temp IDs in the message. The assistant can resolve visible names, but similar names may produce clarification prompts.
