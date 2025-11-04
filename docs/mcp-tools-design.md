# Principal MCP – Initial Dependency Tools

## Context

The new `@a24z/core-library@0.1.25` exposes helpers for working with Principal ADE dependency tasks. Combined with the MCP runtime, we can expose two tools that allow agents to create and retrieve dependency tasks through the centralized ADE HTTP bridge while persisting state via Memory Palace.

### Current Integration

```
Agent → MCP Tool → Principal MCP Server → ADE HTTP Bridge → ADE Logic
                                          ↘ Memory Palace (persist/read tasks)
```

Both tools will share a single `bridgePort`/`bridgeHost` from the MCP server config and rely on the core library for repository lookup and Memory Palace operations.

## Tool 1 – `submit_dependency_task`

### Purpose
Allow an agent to submit a handoff task targeting a dependency repository. The task must be recorded even when ADE is offline and routed to ADE when online.

### Request Schema (proposed)
```ts
{
  dependencyId: string;          // e.g. package name or repo slug
  repositoryRoot?: string;       // absolute path to Memory Palace root (if caller already resolved it)
  taskSummary: string;           // high-level description / title
  taskDetails: string;           // markdown body / instructions passed to MemoryPalace.receiveTask
  priority?: 'low' | 'normal' | 'high' | 'critical';
  tags?: string[];               // categorisation for Memory Palace query APIs
  anchors?: string[];            // file paths (absolute or repo-relative) to convert into task anchors
}
```

### Response Shape
```ts
{
  success: boolean;
  taskId?: string;               // Memory Palace identifier
  repository?: string;           // resolved repository slug/path
  persistedOffline?: boolean;    // true if ADE bridge unavailable
  message?: string;              // diagnostic information
}
```

### Flow
1. Validate payload via Zod schema.
2. Use `core-library` to resolve `dependencyId → repository` (gracefully fail if none).
3. Resolve repository root:
   - If `repositoryRoot` present, validate as git root for Memory Palace.
   - Otherwise request ADE bridge to map `dependencyId → repositoryRoot` (ADE owns canonical mapping).
4. Compute relative `directoryPath` from validated repository root using MemoryPalace utilities (normalising anchors as well; defaults to repository root when anchors absent).
5. Construct `CreateTaskInput` payload with title/content/tags/anchors and attempt POST to ADE bridge `/dependencies/submit` (bridge will reuse MemoryPalace class for persistence), deriving the Memory Palace `senderId` from the repository identity (no explicit requester field required).
6. If ADE bridge responds `200`, persist confirmation to Memory Palace and return success.
7. If ADE bridge unreachable:
   - Persist request in Memory Palace with `status: "pending"`.
   - Return success with `persistedOffline = true`.
8. Surface meaningful errors (validation, unexpected response) through `isError` results.

### Key Modules
- `core-library` dependency resolution + Memory Palace client.
- New MCP tool: `SubmitDependencyTaskTool` (extends `BaseTool`).
- Shared HTTP helper for ADE bridge requests (reuse existing single port settings).

## Tool 2 – `get_dependency_task_doc`

### Purpose
Given a task identifier, return the absolute path to the ADE task document or offline record so the agent can open / resume work.

### Request Schema (proposed)
```ts
{
  taskId: string;
  dependencyId?: string;         // optional hint for repository lookup when ADE offline
  repositoryRoot?: string;       // absolute path override if caller already knows the Memory Palace root
  requireExistingDoc?: boolean;  // default true – fail if doc missing
}
```

### Response Shape
```ts
{
  success: boolean;
  taskId: string;
  repository?: string;
  documentPath?: string;         // absolute path on disk
  status: 'active' | 'pending' | 'missing';
  message?: string;
}
```

### Flow
1. Validate request, ensure `repositoryRoot` (and optionally `dependencyId` for context) identifies the correct Memory Palace instance.
2. Instantiate MemoryPalace directly using provided repository path and query for task metadata/doc path (no ADE HTTP call needed).
3. If document path missing:
   - When `requireExistingDoc !== false`, return error with `status: "missing"`.
   - Otherwise create shell doc (via core-library helper) and return path.
5. Return resolved document path to agent for immediate usage.

### Key Modules
- `core-library` Memory Palace façade (`tasks.getTask`, `tasks.ensureDocument` etc.).
- New MCP tool: `GetDependencyTaskDocTool` extending `BaseTool`.
- Shared error normalization and logging utilities.

## Shared Considerations

- **Bridge Pathing:** submission uses `BaseTool.resolvePath()` to call `/dependencies/...`; retrieval operates directly against Memory Palace once repository root is identified (no ADE HTTP hop required).
- **Metadata:** keep Memory Palace metadata internal for now; tool interface omits a generic metadata blob until a concrete integration need arises.
- **Timeouts/Retries:** adopt existing MCP HTTP patterns with configurable timeout.
- **Telemetry:** log success/error to stdout for ADE monitoring (future iteration may emit MCP resource updates).
- **Security:** sanitize strings before persisting/returning (avoid path traversal by relying on core-library helpers).

## Open Questions

1. What exact endpoints does the ADE bridge expose for dependency submission and retrieval? (Need confirmation before implementation.)
2. Should task metadata include workspace-specific overrides (e.g., branch name, environment)?
3. How should authentication/authorization be handled if ADE bridge requires tokens?
4. Do we need additional tools for listing tasks or updating statuses in the initial release?

## Next Steps

1. Implement shared ADE HTTP client that wraps fetch with configurable host/port/path.
2. Scaffold both tools under `src/tools/dependency/` with unit tests covering:
   - Validation failures.
   - Online submission success.
   - Offline persistence flow.
   - Retrieval with/without document path.
3. Wire tools into `McpServer.setupDefaultTools()` (or gated by feature flag).
4. Document CLI usage and environment variables once endpoints finalized.
