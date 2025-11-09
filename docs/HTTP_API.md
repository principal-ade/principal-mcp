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

**Important Notes**:
- There are two task submission endpoints:
  - `/tasks/submit` - **Recommended** new endpoint with configurable pending queue
  - `/dependencies/submit` - Legacy endpoint, maintained for backward compatibility
- The `/dependencies/resolve` endpoint is a query-only operation for looking up dependencies without creating tasks

### 1. Submit Dependency Task (Legacy)

Submit a task to the ADE (Agent Development Environment) system using the legacy endpoint.

**Note**: This endpoint is maintained for backward compatibility. New implementations should use `/tasks/submit` instead.

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

### 2. Resolve Dependency

Look up a dependency in registered repositories without submitting a task. This is a query-only operation that returns information about where a dependency is located.

**Endpoint**: `POST /dependencies/resolve`

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```typescript
{
  dependencyId: string;        // Required: Unique identifier for the dependency to look up
  repositoryRoot?: string;     // Optional: Context repository path for resolution
}
```

**Success Response** (200 OK):
```typescript
{
  success: true;
  found: boolean;                    // Whether the dependency was found
  dependencyId: string;              // The dependency that was queried
  alexandriaEntry?: {                // If found in Alexandria registry
    name: string;                    // Repository name
    path: string;                    // Absolute path to repository
    // ... other Alexandria metadata
  };
  packageInfo?: {                    // If found as an installed package
    packagePath: string;             // Path to the package
    // ... other package metadata
  };
  suggestions?: string[];            // Installation suggestions if not found
  message?: string;                  // Human-readable status message
}
```

**Error Response** (4xx/5xx):
```typescript
{
  success: false;
  message?: string;            // Error description
  error?: string;              // Detailed error information
}
```

**Behavior**:
- This is a read-only operation that does not create tasks or modify any files
- Uses the Repository Monitoring system to resolve dependencies
- Checks both Alexandria registry (registered repositories) and installed packages
- Returns detailed information about where the dependency exists
- Useful for validation, debugging, or querying before task submission

**Use Cases**:
- Check if a dependency exists before submitting a task
- Get information about a dependency's location
- Validate dependency names in tooling
- Query the Alexandria registry

**Example Request**:
```bash
curl -X POST http://localhost:3043/dependencies/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "dependencyId": "auth-module",
    "repositoryRoot": "/Users/dev/my-project"
  }'
```

**Example Success Response (Found in Alexandria)**:
```json
{
  "success": true,
  "found": true,
  "dependencyId": "auth-module",
  "alexandriaEntry": {
    "name": "auth-module",
    "path": "/Users/dev/auth-module",
    "description": "Authentication module for the platform",
    "tags": ["auth", "security"]
  },
  "message": "Dependency found in Alexandria registry"
}
```

**Example Success Response (Not Found)**:
```json
{
  "success": true,
  "found": false,
  "dependencyId": "nonexistent-module",
  "suggestions": [
    "Install via npm: npm install nonexistent-module",
    "Register repository in Alexandria"
  ],
  "message": "Dependency not found in registered repositories"
}
```

---

### 3. Submit Task (New - Recommended)

Submit a task to the ADE system using the new configurable pending queue system.

**Endpoint**: `POST /tasks/submit`

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
- If the bridge is unavailable or returns an error, the MCP tool will automatically fall back to persisting the task in the configurable pending queue
- The pending queue location is configurable via `PRINCIPLE_MCP_PENDING_QUEUE_PATH` environment variable
- Default pending queue path: `{repositoryRoot}/.mcp-pending`
- The `repositoryRoot` parameter is required for fallback behavior
- When persisted offline, the response will include `persistedOffline: true`

**Differences from `/dependencies/submit`**:
- Uses configurable pending queue path instead of hardcoded `.palace-work/tasks/`
- Allows teams to customize where pending tasks are stored
- Enables gradual migration from the old tool
- Bridge can implement different handling logic for this endpoint

**Example Request**:
```bash
curl -X POST http://localhost:3044/tasks/submit \
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
  "taskId": "task-xyz789",
  "repository": "/Users/dev/my-project",
  "message": "Task submitted successfully to ADE"
}
```

**Fallback Storage Format**:

When the bridge is unavailable, tasks are stored as JSON files:

```
{pendingQueuePath}/
  task-{uuid}.json
```

Default path: `{repositoryRoot}/.mcp-pending/`

Each file contains:
```json
{
  "taskId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2025-11-08T10:30:00.000Z",
  "repositoryRoot": "/path/to/repo",
  "dependencyId": "some-package-name",
  "taskSummary": "Fix authentication bug",
  "taskDetails": "Detailed description...",
  "priority": "high",
  "tags": ["security", "auth"],
  "anchors": ["src/auth/login.ts", "src/middleware/auth.ts"]
}
```

---

## MCP Tool to HTTP Endpoint Mapping

| MCP Tool Name | HTTP Endpoint | Fallback Strategy | Status |
|---------------|---------------|-------------------|--------|
| `submit_task` | `POST /tasks/submit` | Configurable pending queue (`PRINCIPLE_MCP_PENDING_QUEUE_PATH`) | **Recommended** |
| `submit_dependency_task` | `POST /dependencies/submit` | Local Memory Palace persistence (`.palace-work/tasks/`) | Legacy (to be deprecated) |
| N/A (HTTP-only) | `POST /dependencies/resolve` | N/A (query-only, no fallback needed) | Active |
| `get_dependency_task_doc` | N/A (local only) | Always uses local Memory Palace | Active |
| `add_memory_note` | N/A (local only) | Always uses local Memory Palace | Active |

**Migration Note**: New implementations should use `submit_task` instead of `submit_dependency_task`. The old tool is maintained for backward compatibility but will be deprecated in a future major version.

---

## Memory Palace Fallback Structure

### Legacy Tool (`submit_dependency_task`)

When the HTTP bridge is unavailable, tasks are persisted locally in the repository using the Memory Palace format:

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

### New Tool (`submit_task`)

When the HTTP bridge is unavailable, tasks are persisted as JSON files in a configurable location:

```
{pendingQueuePath}/              # Default: {repositoryRoot}/.mcp-pending
  task-{uuid}.json               # Each task in separate file
```

The pending queue path can be configured via:
- Environment variable: `PRINCIPLE_MCP_PENDING_QUEUE_PATH`
- CLI flag: `--pending-queue-path`

See endpoint documentation for `/tasks/submit` above for the JSON file format.

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
  pendingQueuePath?: string;    // NEW: For submit_task tool
  enabledTools?: string[];      // NEW: For selective tool loading
}

// Submit Task Request (NEW - Recommended)
interface SubmitTaskRequest {
  dependencyId: string;
  repositoryRoot?: string;
  taskSummary: string;
  taskDetails: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  tags?: string[];
  anchors?: string[];
}

// Submit Task Response (NEW - Recommended)
interface SubmitTaskResponse {
  success: boolean;
  taskId?: string;
  repository?: string;
  persistedOffline?: boolean;
  message?: string;
}

// Submit Dependency Task Request (LEGACY)
interface SubmitDependencyTaskRequest {
  dependencyId: string;
  repositoryRoot?: string;
  taskSummary: string;
  taskDetails: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  tags?: string[];
  anchors?: string[];
}

// Submit Dependency Task Response (LEGACY)
interface SubmitDependencyTaskResponse {
  success: boolean;
  taskId?: string;
  repository?: string;
  persistedOffline?: boolean;
  message?: string;
}

// Resolve Dependency Request
interface ResolveDependencyRequest {
  dependencyId: string;
  repositoryRoot?: string;
}

// Resolve Dependency Response
interface ResolveDependencyResponse {
  success: boolean;
  found?: boolean;
  dependencyId?: string;
  alexandriaEntry?: {
    name: string;
    path: string;
    description?: string;
    tags?: string[];
    [key: string]: unknown;
  };
  packageInfo?: {
    packagePath: string;
    [key: string]: unknown;
  };
  suggestions?: string[];
  message?: string;
  error?: string;
}

// Generic HTTP Bridge Response
interface HttpBridgeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}
```

**Note**: The request and response schemas for both tools are identical. The key difference is:
- **Endpoint**: `/tasks/submit` vs `/dependencies/submit`
- **Fallback storage**: Configurable vs hardcoded `.palace-work/tasks/`

---

## Version

API Version: 0.0.3 (matches package version)

MCP Protocol: 1.0.4

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/principle-md/issues
- Package: `@principal-ai/principal-mcp`
