# Configurable Pending Queue - New Task Submission Tool

## Overview

This document describes the design for a **new task submission tool** (`submit_task`) that uses a configurable pending queue location, while keeping the existing `submit_dependency_task` tool available for backward compatibility. The document also covers how to make tools selectively available via configuration flags.

## Problem Statement

Currently, when the ADE HTTP bridge is offline, `submit_dependency_task` falls back to persisting tasks locally using a hardcoded Memory Palace path (`.palace-work/tasks/`). However:

1. **Different repositories may use different task management systems** (GitHub Issues, Linear, Jira, etc.)
2. **The MCP server doesn't know which system to use** - that resolution logic lives in the ADE bridge
3. **The bridge needs to discover pending tasks** when it comes back online and route them appropriately
4. **Teams have different workflows** and may want pending tasks stored in specific locations that fit their process
5. **We need gradual migration** without breaking existing integrations

## Solution Approach

Instead of modifying the existing tool, create a **new tool** with the improved architecture:

- **New tool**: `submit_task` - Uses configurable pending queue
- **Existing tool**: `submit_dependency_task` - Remains unchanged, uses Memory Palace
- **Tool selection**: Configure which tools are enabled via environment variables
- **Deprecation path**: Teams can migrate at their own pace

## Current Architecture

```
Agent → submit_dependency_task → trySubmitToAde()
                                  ├─ Success: POST /dependencies/submit → Bridge routes to destination
                                  └─ Failure: persistTaskLocally() → .palace-work/tasks/
```

The bridge receives the task at `/dependencies/submit` and uses package.json, repo config, or other context to determine the routing destination (GitHub, Linear, etc.).

## Proposed Architecture

```
Agent → submit_task → trySubmitToAde()
                      ├─ Success: POST /tasks/submit → Bridge routes to destination
                      └─ Failure: persistTaskLocally() → {pendingQueuePath} (configurable)
```

The new tool uses `/tasks/submit` endpoint, allowing the bridge to differentiate requests and handle them differently. The fallback storage location is configurable via `PRINCIPLE_MCP_PENDING_QUEUE_PATH`.

## Proposed Solution

### 1. New Tool: `submit_task`

Create a new tool that uses a configurable pending queue, keeping the existing `submit_dependency_task` unchanged.

#### Tool Name
- **New**: `submit_task` (or `submit_task_v2`)
- **Existing**: `submit_dependency_task` (unchanged)

#### API Endpoint Differentiation

**CRITICAL**: The new tool MUST use a different HTTP endpoint to allow the bridge to differentiate between old and new tool requests:

- **Old tool**: `POST /dependencies/submit`
- **New tool**: `POST /tasks/submit`

This separation is essential for:
1. **Bridge migration**: The bridge can route requests differently based on endpoint
2. **Backward compatibility**: Old tool behavior remains unchanged
3. **Gradual deprecation**: `/dependencies/submit` can eventually be deprecated without breaking the new tool
4. **Different behavior**: New tool can use different pending queue paths and logic

**Implementation Note**: When creating `SubmitTaskTool`, use:
```typescript
const endpoint = this.resolvePath('/tasks/submit');  // NOT /dependencies/submit
```

#### Configuration

**Environment Variables:**

```bash
PRINCIPLE_MCP_PENDING_QUEUE_PATH   # Where to store pending tasks
PRINCIPLE_MCP_ENABLED_TOOLS        # Comma-separated list of tools to enable
```

**Command-Line Flags:**

```bash
--pending-queue-path <path>        # Where to store pending tasks
--tools <tool1,tool2,...>          # Comma-separated list of tools to enable
```

**Priority Order:** CLI flags > Environment variables > Defaults

**Default value for pending queue**: `{repositoryRoot}/.mcp-pending` (computed at runtime)

**Path Requirements**: Must be an absolute path

**Examples for pending queue path**:
- `/Users/username/project/.mcp-pending` - Repo-specific queue
- `/Users/username/project/.palace-work/pending` - Within Memory Palace structure
- `/Users/username/project/.github/pending-issues` - GitHub-adjacent for visibility
- `/tmp/mcp-queue` - Temporary global storage
- `/var/lib/mcp/pending-tasks` - System-level global queue
- `~/tasks/pending` - User-level global queue (expand `~` to home directory)

**Examples for tool selection**:
- `submit_task,get_dependency_task_doc,add_memory_note` - Only new tool
- `submit_dependency_task,submit_task,get_dependency_task_doc,add_memory_note` - Both old and new (transition period)
- Not set or `*` - All tools enabled (default)

### 2. Configuration Interface

Update `McpServerConfig` in `src/types/mcp-types.ts`:

```typescript
interface McpServerConfig {
  name: string;
  version: string;
  bridgePort: number;
  bridgeHost?: string;
  bridgePath?: string;
  pendingQueuePath?: string;      // NEW: Configurable pending task queue location
  enabledTools?: string[];        // NEW: List of tool names to enable (undefined = all)
}
```

### 3. CLI Argument Parsing and Configuration Loading

Update `src/index.ts` to parse CLI arguments and load configuration with priority order:

```typescript
import { parseArgs } from 'node:util';

// Parse command-line arguments
const { values: cliArgs } = parseArgs({
  options: {
    'pending-queue-path': { type: 'string' },
    'tools': { type: 'string' },
    'port': { type: 'string' },
    'host': { type: 'string' },
  },
  strict: false,
});

// Priority: CLI flags > env vars > defaults
const port = parseInt(
  cliArgs.port ||
  process.env.PRINCIPLE_MCP_PORT ||
  process.env.PORT ||
  '3044'
);

const pendingQueuePath =
  cliArgs['pending-queue-path'] ||
  process.env.PRINCIPLE_MCP_PENDING_QUEUE_PATH;

const enabledToolsStr =
  cliArgs.tools ||
  process.env.PRINCIPLE_MCP_ENABLED_TOOLS;

const enabledTools = enabledToolsStr && enabledToolsStr !== '*'
  ? enabledToolsStr.split(',').map(t => t.trim())
  : undefined;  // undefined means "all tools"

const config: McpServerConfig = {
  name: BRANDING.MCP_SERVER_NAME,
  version: BRANDING.MCP_VERSION,
  bridgePort: port,
  bridgeHost: cliArgs.host || process.env.PRINCIPLE_MCP_HOST || 'localhost',
  bridgePath: process.env.PRINCIPLE_MCP_PATH || '',
  pendingQueuePath: pendingQueuePath,  // No default - computed per-task
  enabledTools: enabledTools,
};
```

**Note**: The default pending queue path is computed at runtime when submitting a task, based on the `repositoryRoot` parameter. If neither CLI flag nor env var is set, the tool will use `{repositoryRoot}/.mcp-pending`.

### 4. Tool Registration with Conditional Loading

Update `src/server/McpServer.ts` to conditionally register tools:

```typescript
private setupDefaultTools() {
  const tools = [
    { name: 'submit_dependency_task', factory: () => new SubmitDependencyTaskTool(this.config) },
    { name: 'submit_task', factory: () => new SubmitTaskTool(this.config) },
    { name: 'get_dependency_task_doc', factory: () => new GetDependencyTaskDocTool(this.config) },
    { name: 'add_memory_note', factory: () => new AddMemoryNoteTool(this.config) },
  ];

  for (const tool of tools) {
    // If enabledTools is undefined, enable all tools
    // Otherwise, only enable tools in the list
    if (!this.config.enabledTools || this.config.enabledTools.includes(tool.name)) {
      this.addTool(tool.factory());
    }
  }
}
```

## File Format & Storage

### Format
- **Type**: JSON files only (no need for format configuration)
- **Naming**: `task-{uuid}.json` where uuid is generated per task
- **Content**: Full task payload including all metadata needed for routing

### Example File Structure

```
{repositoryRoot}/.mcp-pending/
  task-a1b2c3d4-e5f6-7890-abcd-ef1234567890.json
  task-f9e8d7c6-b5a4-3210-9876-543210fedcba.json
```

### File Contents

Each JSON file contains the complete task submission payload:

```json
{
  "taskId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2025-11-03T10:30:00.000Z",
  "repositoryRoot": "/path/to/repo",
  "dependencyId": "some-package-name",
  "taskSummary": "Fix authentication bug",
  "taskDetails": "Detailed description...",
  "priority": "high",
  "tags": ["security", "auth"],
  "anchors": ["src/auth/login.ts", "src/middleware/auth.ts"]
}
```

## Implementation Changes

### New Files to Create

1. **`src/tools/task/SubmitTaskTool.ts`**
   - New tool implementation based on `SubmitDependencyTaskTool`
   - **CRITICAL**: Uses `POST /tasks/submit` endpoint (NOT `/dependencies/submit`)
   - Uses `this.config.pendingQueuePath` for fallback storage
   - Same schema and behavior as existing tool, but with configurable queue and different endpoint

### Files to Modify

1. **`src/types/mcp-types.ts`**
   - Add `pendingQueuePath?: string` to `McpServerConfig` interface
   - Add `enabledTools?: string[]` to `McpServerConfig` interface

2. **`src/index.ts`**
   - Add CLI argument parsing using `node:util` `parseArgs`
   - Add environment variable loading for `PRINCIPLE_MCP_PENDING_QUEUE_PATH`
   - Add environment variable loading for `PRINCIPLE_MCP_ENABLED_TOOLS`
   - Implement priority: CLI flags > env vars > defaults
   - Parse enabled tools list and pass to config

3. **`src/server/McpServer.ts`**
   - Update `setupDefaultTools()` to conditionally register tools based on `config.enabledTools`
   - Add `SubmitTaskTool` to the list of available tools

4. **`src/tools/index.ts`**
   - Export the new `SubmitTaskTool` class

5. **`README.md`**
   - Document the new `submit_task` tool in the "Included MCP Tools" table
   - Add new configuration options to the Configuration table:
     - `PRINCIPLE_MCP_PENDING_QUEUE_PATH`
     - `PRINCIPLE_MCP_ENABLED_TOOLS`
   - Add migration guidance for teams moving from `submit_dependency_task` to `submit_task`

### Key Considerations

#### Path Resolution
- **All paths must be absolute** - no relative path support
- If `PRINCIPLE_MCP_PENDING_QUEUE_PATH` is not set, default to `{repositoryRoot}/.mcp-pending`
- If `PRINCIPLE_MCP_PENDING_QUEUE_PATH` is set, use it as-is (must be absolute)
- Expand `~` to home directory if present
- Validate that path is absolute before using (reject relative paths with clear error)
- Directory creation should happen automatically with appropriate permissions

#### Bridge Integration
When the ADE bridge comes back online, it should:
1. Discover the pending queue location (via same env var)
2. Read all `task-*.json` files
3. Apply its resolution strategy to determine routing destination
4. Submit tasks to appropriate destinations (GitHub/Linear/etc.)
5. Clean up successfully processed files

#### Backward Compatibility
- Existing `.palace-work/tasks/` storage continues to work if teams don't configure the new variable
- Migration is optional - teams can configure when ready
- No breaking changes to tool schemas or responses

## Benefits

1. **Backward Compatibility**: Existing `submit_dependency_task` continues working unchanged
2. **Gradual Migration**: Teams can test `submit_task` alongside the old tool
3. **Flexibility**: Teams configure queue location to match their workflow
4. **No Assumptions**: MCP server doesn't assume Memory Palace or any specific structure
5. **Bridge-Friendly**: Bridge can watch/monitor configured queue path
6. **Consistent Pattern**: Follows same env var pattern as port/host/path configuration
7. **Team Control**: Different teams/repos can use different locations and tools
8. **Simple Format**: JSON-only keeps implementation straightforward
9. **Tool Selection**: Fine-grained control over which tools are available
10. **Safe Deprecation**: Old tool can be removed when all teams have migrated

## Open Questions

1. **Cleanup Strategy**: Should MCP server attempt to resubmit pending tasks on startup, or leave that entirely to the bridge?
   - **Recommendation**: Leave to bridge - it has the resolution logic

2. **Path Validation**: How strict should we be about absolute paths?
   - **Decision**: Require absolute paths only. Reject relative paths with clear error message.
   - Default: `{repositoryRoot}/.mcp-pending` computed at runtime

3. **Collision Handling**: What if multiple MCP instances write to the same queue?
   - **Recommendation**: UUID-based filenames prevent collisions

4. **Error States**: What if queue directory is not writable?
   - **Recommendation**: Surface error to agent, don't silently fail

## Example Usage

### Default Configuration (All Tools)
```bash
# All tools enabled, uses default {repositoryRoot}/.mcp-pending queue
npx @principal-ai/principal-mcp
```

### Using CLI Flags - Only New Tool Enabled
```bash
# Only enable the new submit_task tool via CLI flag
npx @principal-ai/principal-mcp --tools submit_task,get_dependency_task_doc,add_memory_note
```

### Using Environment Variables - Only New Tool Enabled
```bash
# Only enable the new submit_task tool via env var
PRINCIPLE_MCP_ENABLED_TOOLS=submit_task,get_dependency_task_doc,add_memory_note \
  npx @principal-ai/principal-mcp
```

### Transition Period (Both Tools)
```bash
# Enable both old and new tools during migration
npx @principal-ai/principal-mcp \
  --tools submit_dependency_task,submit_task,get_dependency_task_doc,add_memory_note
```

### Custom Queue Location via CLI Flag
```bash
# Store pending tasks in custom location (must be absolute path)
npx @principal-ai/principal-mcp \
  --pending-queue-path /Users/username/myproject/.github/pending-issues \
  --tools submit_task,get_dependency_task_doc,add_memory_note
```

### Custom Queue Location via Environment Variable
```bash
# Store pending tasks in GitHub-adjacent location (must be absolute path)
PRINCIPLE_MCP_PENDING_QUEUE_PATH=/Users/username/myproject/.github/pending-issues \
PRINCIPLE_MCP_ENABLED_TOOLS=submit_task,get_dependency_task_doc,add_memory_note \
  npx @principal-ai/principal-mcp
```

### Global Queue
```bash
# All repos share a global pending queue
npx @principal-ai/principal-mcp \
  --pending-queue-path /var/lib/mcp/pending-tasks \
  --tools submit_task,get_dependency_task_doc,add_memory_note
```

### Mixed CLI and Environment Variables
```bash
# CLI flags override environment variables
export PRINCIPLE_MCP_ENABLED_TOOLS=submit_dependency_task
npx @principal-ai/principal-mcp \
  --tools submit_task,get_dependency_task_doc,add_memory_note  # This takes precedence
```

### Integration with Bridge
```bash
# Both MCP and bridge use same queue location (absolute path)
npx @principal-ai/principal-mcp \
  --pending-queue-path /var/lib/mcp/pending-tasks \
  --tools submit_task,get_dependency_task_doc,add_memory_note &
./ade-bridge --pending-queue=/var/lib/mcp/pending-tasks
```

### Claude Desktop / MCP Client Configuration
```json
{
  "mcpServers": {
    "principal-mcp": {
      "command": "npx",
      "args": [
        "@principal-ai/principal-mcp",
        "--tools", "submit_task,get_dependency_task_doc,add_memory_note",
        "--pending-queue-path", "/var/lib/mcp/pending-tasks"
      ]
    }
  }
}
```

## Migration Path

### Phase 1: Implementation
- Create new `SubmitTaskTool` with configurable pending queue
- Add `PRINCIPLE_MCP_PENDING_QUEUE_PATH` configuration
- Add `PRINCIPLE_MCP_ENABLED_TOOLS` configuration
- Update `McpServer.setupDefaultTools()` for conditional tool loading
- Default to all tools enabled for backward compatibility

### Phase 2: Testing & Rollout
- Teams test `submit_task` alongside `submit_dependency_task`
- Use `PRINCIPLE_MCP_ENABLED_TOOLS` to enable both during transition
- Validate pending queue behavior with different paths
- Confirm bridge can process tasks from custom queue locations

### Phase 3: Documentation
- Update README with both tools documented
- Add configuration examples for different scenarios
- Document migration steps for teams
- Explain tool selection via `PRINCIPLE_MCP_ENABLED_TOOLS`

### Phase 4: Migration
- Teams gradually switch from `submit_dependency_task` to `submit_task`
- Configure `PRINCIPLE_MCP_PENDING_QUEUE_PATH` for their workflow
- Update agent prompts/instructions to use new tool

### Phase 5: Deprecation (Future)
- Mark `submit_dependency_task` as deprecated in documentation
- Remove from default enabled tools list
- Eventually remove implementation (major version bump)

## Tool Comparison

| Feature | `submit_dependency_task` (Old) | `submit_task` (New) |
|---------|-------------------------------|---------------------|
| HTTP endpoint | `POST /dependencies/submit` | `POST /tasks/submit` |
| Fallback storage | `.palace-work/tasks/` (hardcoded) | Configurable via env var |
| Default queue path | `.palace-work/tasks/` | `{repositoryRoot}/.mcp-pending` |
| Path type | Relative (hardcoded) | Absolute only (validated) |
| Configuration | None | `PRINCIPLE_MCP_PENDING_QUEUE_PATH` |
| Schema | Same | Same (unchanged) |
| Bridge differentiation | Legacy endpoint | New endpoint allows different handling |
| Deprecation status | Will be deprecated | Active development |
| Backward compatible | N/A | Yes (can run alongside old tool) |

## Related Files

### Existing Files
- `src/tools/dependency/SubmitDependencyTaskTool.ts` - Old tool (unchanged)
- `src/tools/dependency/GetDependencyTaskDocTool.ts` - Task retrieval
- `src/tools/memory/AddMemoryNoteTool.ts` - Memory notes
- `src/server/McpServer.ts` - Server & tool registration
- `src/types/mcp-types.ts` - Type definitions
- `src/index.ts` - Configuration initialization
- `README.md` - User-facing documentation
- `docs/mcp-tools-design.md` - Original tool design

### New Files to Create
- `src/tools/task/SubmitTaskTool.ts` - New tool implementation

## References

- Original discussion: Memory Palace fallback vs configurable queue
- Port configuration pattern: `PRINCIPLE_MCP_PORT`, `PRINCIPLE_MCP_HOST`, `PRINCIPLE_MCP_PATH`
- Resolution strategy: Bridge determines routing based on repo context
- Tool selection: Conditional loading via `PRINCIPLE_MCP_ENABLED_TOOLS`
