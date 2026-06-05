# Jobs MCP Assistant Server

An AI integration layer that enables natural language interaction with the Jobs Workforce Management System.

The MCP server acts as a bridge between users and the workforce management platform, allowing workforce operations to be performed using conversational requests.

---

## Project Overview

This project explores how AI assistants can be integrated into traditional business applications.

Rather than requiring users to navigate multiple screens, the MCP server enables interactions such as:

- "Show available workers next week"
- "Assign John to Job 42"
- "Why can't this worker be assigned?"
- "Show details for today's jobs"

The server translates natural language requests into structured API operations.

---

## Key Features

### Conversational Workflows

- Job lookup
- Worker lookup
- Availability checking
- Assignment validation
- Workforce information retrieval

### AI Integration

- MCP architecture
- Tool discovery
- Tool execution
- Context-aware interactions

### Backend Integration

- Secure API communication
- Workforce API integration
- Error handling
- Request orchestration

---

## Technology Stack

- TypeScript
- Node.js
- Express
- Axios
- Vitest

The project uses a lightweight architecture focused on experimentation and rapid iteration. :contentReference[oaicite:0]{index=0}

---

## Architecture

```text
User
  │
  ▼
MCP Assistant
  │
  ▼
Jobs API
  │
  ▼
Aurora Database
```

---

## Cloud Deployment

Deployed alongside the Jobs platform using AWS infrastructure.

The deployment experience included:

- Application hosting
- HTTPS configuration
- DNS management
- Secure API communication

---

## What I Learned

This project allowed me to explore modern AI integration patterns.

Key learning outcomes:

- MCP concepts and architecture
- Tool-based AI workflows
- API orchestration
- Prompt design
- Context management
- TypeScript backend development
- AI-assisted user experiences

It also demonstrated how traditional enterprise systems can be enhanced with conversational interfaces without replacing existing business logic.

---

## Why This Project Matters

Many business systems still rely on complex interfaces and manual workflows.

This project explores how AI can improve productivity by providing a conversational layer over existing applications while keeping business rules, security, and data ownership within the core platform.

---

## Future Improvements

- Multi-step AI workflows
- Intelligent workforce recommendations
- Scheduling optimisation
- Context memory
- AI-generated workforce reports