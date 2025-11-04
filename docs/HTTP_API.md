# Principal MCP HTTP Bridge API Documentation

## Overview

The Principal MCP server communicates via stdio using the Model Context Protocol (MCP), but its tools make HTTP requests to an external bridge server for certain operations. This document describes the HTTP API endpoints that the bridge server must implement.

## Configuration

The HTTP bridge is configured via environment variables or `McpServerConfig`:

- **Host**: `PRINCIPLE_MCP_HOST` (default: `localhost`)
- **Port**: `PRINCIPLE_MCP_PORT` or `PORT` (default: `3043`)
- **Protocol**: `PRINCIPLE_MCP_PROTOCOL` (default: `http`)
- **Base Path**: `PRINCIPLE_MCP_PATH` (default: empty string)

## Base URL Structure

```
{protocol}://{host}:{port}{basePath}{endpoint}
```

Example: `http://localhost:3043/dependencies/submit`

---

## Endpoints

### 1. Submit Dependency Task

Submit a task to the ADE (Agent Development Environment) system.

**Endpoint**: `POST /dependencies/submit`

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```typescript
{
  dependencyId: string;        // Required: Unique identifier for the dependency
  repositoryRoot?: string;     // Optional: Absolute path to repository root
  taskSummary: string;         // Required: Brief summary of the task
  taskDetails: string;         // Required: Detailed task description
  priority?: "low" | "normal" | "high" | "critical";  // Optional: Task priority
  tags?: string[];             // Optional: Array of tags for categorization
  anchors?: string[];          // Optional: File paths related to this task
}
```

**Success Response** (200 OK):
```typescript
{
  success: true;
  taskId: string;              // Unique task identifier
  repository?: string;         // Repository where task was submitted
  message?: string;            // Optional success message
}
```

**Error Response** (4xx/5xx):
```typescript
{
  success: false;
  message?: string;            // Error description
}
```

**Behavior**:
- If the bridge is unavailable or returns an error, the MCP tool will automatically fall back to persisting the task in the local Memory Palace (`.palace-work/tasks/` directory)
- The `repositoryRoot` parameter is required for fallback behavior
- When persisted offline, the response will include `persistedOffline: true`

**Example Request**:
```bash
curl -X POST http://localhost:3043/dependencies/submit \
  -H "Content-Type: application/json" \
  -d '{
    "dependencyId": "auth-module",
    "repositoryRoot": "/Users/dev/my-project",
    "taskSummary": "Implement OAuth2 authentication",
    "taskDetails": "Add OAuth2 authentication flow with support for Google and GitHub providers",
    "priority": "high",
    "tags": ["auth", "security"],
    "anchors": ["src/auth/index.ts", "src/config/oauth.ts"]
  }'
```

**Example Success Response**:
```json
{
  "success": true,
  "taskId": "task-abc123",
  "repository": "/Users/dev/my-project",
  "message": "Task submitted successfully to ADE"
}
```

---

## MCP Tool to HTTP Endpoint Mapping

| MCP Tool Name | HTTP Endpoint | Fallback Strategy |
|---------------|---------------|-------------------|
| `submit_dependency_task` | `POST /dependencies/submit` | Local Memory Palace persistence |
| `get_dependency_task_doc` | N/A (local only) | Always uses local Memory Palace |
| `add_memory_note` | N/A (local only) | Always uses local Memory Palace |

---

## Memory Palace Fallback Structure

When the HTTP bridge is unavailable, tasks are persisted locally in the repository:

```
{repositoryRoot}/
  .palace-work/
    tasks/
      active/
        {taskId}.task.md       # Active tasks
      history/
        {taskId}.hist.md       # Completed tasks
```

Task files are stored in Markdown format with the following structure:

```markdown
# {taskSummary}

{taskDetails}

---
Status: pending|in-progress|completed
Priority: low|normal|high|critical
Tags: tag1, tag2, tag3
Anchors: path/to/file1.ts, path/to/file2.ts
Sender: {dependencyId}
```

---

## Error Handling

### HTTP Bridge Errors

When the HTTP bridge returns an error or is unavailable:

1. The MCP tool logs the error
2. For `submit_dependency_task`: Falls back to local Memory Palace persistence
3. Returns a response indicating offline mode: `persistedOffline: true`

### Client-Side Error Handling

HTTP clients should handle these scenarios:

- **Connection refused**: Bridge server is not running
- **Timeout**: Bridge server is unresponsive
- **4xx errors**: Invalid request (check request validation)
- **5xx errors**: Bridge server error (retry with exponential backoff)

---

## Security Considerations

1. **No Authentication**: The current implementation does not include authentication. If deploying in a production environment, implement:
   - API key authentication
   - JWT tokens
   - IP allowlisting

2. **Path Validation**: The `repositoryRoot` and `anchors` paths are validated to prevent directory traversal attacks

3. **Input Validation**: All request bodies are validated using Zod schemas before processing

---

## Development & Testing

### Starting the Bridge Server

The bridge server is separate from the MCP server. You must implement and run your own HTTP server that handles these endpoints.

### Testing Without a Bridge

The MCP tools will automatically fall back to local persistence, allowing you to develop and test without a running bridge server. Simply omit the bridge configuration or use an invalid port:

```bash
PRINCIPLE_MCP_PORT=0 principal-mcp
```

### Health Check

To verify the bridge is running, you can check the MCP server's status resource:

```typescript
// Via MCP protocol
{
  "method": "resources/read",
  "params": {
    "uri": "app://status"
  }
}
```

Response includes:
```json
{
  "status": "running",
  "messageQueue": 0,
  "timestamp": 1234567890,
  "uptime": 123.45,
  "memoryUsage": { /* Node.js memory usage */ }
}
```

---

## Implementation Reference

### TypeScript Interface Definitions

```typescript
// Configuration
interface McpServerConfig {
  name: string;
  version: string;
  bridgePort: number;
  bridgeHost?: string;
  bridgePath?: string;
}

// Submit Dependency Task Request
interface SubmitDependencyTaskRequest {
  dependencyId: string;
  repositoryRoot?: string;
  taskSummary: string;
  taskDetails: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  tags?: string[];
  anchors?: string[];
}

// Submit Dependency Task Response
interface SubmitDependencyTaskResponse {
  success: boolean;
  taskId?: string;
  repository?: string;
  persistedOffline?: boolean;
  message?: string;
}

// Generic HTTP Bridge Response
interface HttpBridgeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}
```

---

## Version

API Version: 0.0.3 (matches package version)

MCP Protocol: 1.0.4

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/principle-md/issues
- Package: `@principal-ai/principal-mcp`
