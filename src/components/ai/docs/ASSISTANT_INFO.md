# DazzleDuck AI Assistant

## Overview

The DazzleDuck AI Assistant is a frontend-only conversational interface that helps users explore databases, execute named queries, and generate read-only SQL through natural language.

The assistant uses Google's Gemini models for reasoning and function calling while leveraging existing DazzleDuck APIs and contexts for metadata retrieval and query execution.

---

## Capabilities

The assistant supports:

- Database discovery
- Table discovery
- Table description
- Named query discovery
- Named query execution
- Read-only SQL generation
- Read-only SQL execution
- Result visualization
- Conversational database assistance

All query execution is confirmation-gated and restricted to read-only operations.

---

# Repository Layout

```text
src/

components/
└── ai/
    ├── AIChat.jsx
    ├── AIErrorBoundary.jsx
    ├── ConfigErrorBoundary.jsx
    ├── ChatMessage.jsx
    ├── SQLPreviewModal.jsx
    ├── ToolBadge.jsx
    │
    ├── gemini/
    │   ├── intents.js
    │   └── systemPrompts.js
    │
    ├── hooks/
    │   ├── useAIConfig.js
    │   ├── useGeminiChat.js
    │   ├── useChatPersistence.js
    │   ├── useConversationCompaction.js
    │   └── useToolExecution.js
    │
    └── tools/
        ├── queryValidator.js
        └── toolRegistry.js

config/
└── aiModels.js

services/
├── geminiValidation.js
└── geminiErrors.js

context/
├── AIConfigContext.jsx
└── QueryDashboardContext.jsx
```
---

## Architecture

```text
User
  ↓
AIChat
  ↓
useGeminiChat
  ↓
Gemini Function Calling
  ↓
toolRegistry
  ↓
QueryDashboardContext
  ↓
DazzleDuck Server
  ↓
Results
```

### Responsibilities

| Component | Responsibility |
|------------|---------------|
| AIChat | Assistant UI and result presentation |
| useGeminiChat | Conversation orchestration |
| toolRegistry | Tool definitions and execution |
| QueryDashboardContext | Backend communication |
| queryValidator | Read-only SQL enforcement |
| AIConfigContext | Gemini configuration management |

---

## Query Execution Flow

### SQL Queries

```text
User Request
  ↓
Gemini
  ↓
executeQuery Tool Call
  ↓
SQL Preview
  ↓
User Confirmation
  ↓
Execution
  ↓
Results
```

### Named Queries

```text
User Request
  ↓
Gemini
  ↓
executeNamedQuery Tool Call
  ↓
Named Query Preview
  ↓
User Confirmation
  ↓
Execution
  ↓
Results
```

---

## Tooling

The assistant exposes a set of browser-side tools through `toolRegistry.js`.

### Metadata Tools

- listDatabases
- listTables
- describeTable
- listNamedQueries

### Execution Tools

- executeQuery
- executeNamedQuery

All tools execute through the existing Query Dashboard infrastructure.

---

## Safety

### Read-Only Enforcement

SQL execution is validated through `queryValidator.js`.

Blocked operations include:

- INSERT
- UPDATE
- DELETE
- DROP
- ALTER
- TRUNCATE

Only read-only statements are allowed.

### Confirmation Requirement

Execution actions require explicit user confirmation before running.

This applies to:

- SQL queries
- Named queries

---

## Configuration

Gemini configuration is managed through `AIConfigContext`.

Configuration includes:

- API key
- Model selection
- Validation status
- Persistence preferences

Supported models are defined in:

```text
src/config/aiModels.js
```

Gemini validation logic is implemented in:

```text
src/services/geminiValidation.js
```

---

## Important Files

### Core Components

```text
src/components/ai/AIChat.jsx
src/components/ai/hooks/useGeminiChat.js
```

### Gemini Integration

```text
src/components/ai/gemini/systemPrompts.js
src/components/ai/gemini/intents.js
```

### Tooling

```text
src/components/ai/tools/toolRegistry.js
src/components/ai/tools/queryValidator.js
```

### Configuration

```text
src/context/AIConfigContext.jsx
src/config/aiModels.js
src/services/geminiValidation.js
src/services/geminiErrors.js
```

### Backend Integration

```text
src/context/QueryDashboardContext.jsx
```

---

## Testing

Primary AI Assistant coverage is provided by:

```text
tests/AIFlow.test.js
tests/queryValidator.test.js
```

These tests cover:

- Named query workflows
- SQL workflows
- Confirmation flows
- Result rendering
- Query validation

---

## Gemini Availability

The assistant depends on Gemini availability.

Examples of external failures include:

* API outages
* rate limiting
* quota exhaustion
* 503 overload responses

These are handled gracefully through centralized error mapping.

---

## Notes

- The AI Assistant is implemented entirely in the frontend.
- Query execution is performed through the connected DazzleDuck server.
- Gemini is used for reasoning and tool selection.
- The assistant does not maintain a dedicated backend AI service.