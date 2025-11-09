# Principal MCP

Model Context Protocol server bundle for PrincipalMD. This package mirrors the `agent-hooks` workflow so teams can run the MCP server via `npx` or install it locally without cloning the full Electron app.

## Installation & Quick Start

```bash
# one-off execution
npx @principal-ai/principal-mcp

# or install globally
npm install -g @principal-ai/principal-mcp
principal-mcp
```

### Configuration

| Option | Description | Default |
| ------ | ----------- | ------- |
| `--port`, `PRINCIPLE_MCP_PORT` | MCP bridge port shared by prompt and dependency tools | `3043` |
| `--host`, `PRINCIPLE_MCP_HOST` | MCP bridge host | `localhost` |
| `PRINCIPLE_MCP_PROTOCOL` | Protocol used when contacting ADE HTTP bridge from CLI tools | `http` |

The CLI reads the same environment variables as the Electron app so it can route requests through the unified ADE bridge. When the bridge is offline, dependency tasks fall back to Memory Palace storage (requires a repository root on disk).

## Included MCP Tools

| Tool | Purpose |
| ---- | ------- |
| `submit_dependency_task` | Submit a dependency task to ADE; if the bridge is unavailable the task is persisted locally using Memory Palace. |
| `submit_task` | Submit a task to ADE with configurable pending queue path; recommended over `submit_dependency_task`. |
| `get_dependency_task_doc` | Resolve the absolute path to a dependency task document stored in Memory Palace. |
| `add_memory_note` | Create anchored notes in the repository's Memory Palace for storing development insights. |
| `resolve_project` | Get comprehensive project information including metadata, permissions, local clones, and remote details. |

## Package Layout

```
principal-mcp/
  docs/                     # Design notes
  src/
    index.ts                # CLI entry point
    server/                 # MCP server implementation
    tools/                  # Tool implementations (dependency & memory tools)
    types/, utils/          # Shared types & helpers
  scripts/bundle.ts         # Bun-based esbuild bundler
  tests/                    # Bun test suite
  dist/                     # Generated bundle after build
```

## Development

```bash
# install dependencies
bun install

# run tests
bun test

# build the distributable bundle
bun run build

# publish (runs clean → build → test automatically)

```

## Runtime Notes

- MCP interactions use a single HTTP bridge port (default `3043`) for dependency workflows.
- When `submit_dependency_task` cannot reach ADE it persists the task via Memory Palace; `repositoryRoot` must be supplied in that scenario so the CLI can locate the git root.
- `get_dependency_task_doc` reads directly from Memory Palace to provide the path to active or completed task documents.
- `add_memory_note` creates anchored notes locally in the repository's Memory Palace without requiring bridge connectivity.

## Resources

- Original implementation reference: `PrincipleMD/core/src/mcp/*`
- Core library dependency: `@a24z/core-library` (provides Memory Palace + filesystem adapters)
- MCP SDK: `@modelcontextprotocol/sdk`