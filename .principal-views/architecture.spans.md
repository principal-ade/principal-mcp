# Span Conventions

## Overview

This canvas defines the vocabulary of operations (spans) that the `principal-mcp` service emits. Edges represent valid parent-child relationships in the trace hierarchy.

## Architectural Layers

The service follows a layered architecture reflected in span organization:

| Layer | Span Kind | Purpose |
|-------|-----------|---------|
| **Entry** | SERVER | MCP protocol request entry points |
| **Domain** | INTERNAL | Tool execution and business logic |
| **Infrastructure** | CLIENT/INTERNAL | External calls and data persistence |

## Span Patterns by Layer

### Entry Points (SERVER)

| Pattern | Description | Attributes |
|---------|-------------|------------|
| `mcp.request` | MCP protocol request handling | `mcp.method` (list_tools, call_tool, list_resources, read_resource) |

**Purpose**: Entry point for all MCP protocol interactions. These are root spans for incoming requests from LLM clients.

### Domain Operations (INTERNAL)

| Pattern | Description | Child Operations |
|---------|-------------|------------------|
| `tool.execute` | Generic tool execution wrapper | Delegates to specific tool spans |
| `tool.submit_dependency_task.*` | Submit dependency task with local tracking | `http.bridge.*`, `memory.task.*` |
| `tool.resolve_project` | Query project metadata and capabilities | `http.bridge.*` |

**Purpose**: Represent business logic and tool-specific operations. These spans encapsulate the core functionality of each MCP tool.

**Wildcard Patterns**:
- `tool.submit_dependency_task.*` - Matches operations like `tool.submit_dependency_task.validate`, `tool.submit_dependency_task.execute`, etc.

### Infrastructure (CLIENT/INTERNAL)

| Pattern | Kind | Description |
|---------|------|-------------|
| `http.bridge.*` | CLIENT | HTTP requests to ADE bridge |
| `memory.task.*` | INTERNAL | Memory Palace task operations |
| `memory.note.*` | INTERNAL | Memory Palace note operations |

**Purpose**: External dependencies and data persistence. These are leaf spans that don't invoke other operations.

**HTTP Bridge Patterns**:
- `http.bridge.dependencies.submit` - Submit task to ADE
- `http.bridge.projects.resolve` - Query project information

**Memory Palace Patterns**:
- `memory.task.create` - Create local tracking task
- `memory.note.add` - Add anchored note

## Valid Span Hierarchies

### MCP Request Flow

```
mcp.request (SERVER)
  └─ tool.execute (INTERNAL)
       ├─ tool.submit_dependency_task.* (INTERNAL)
       │    ├─ http.bridge.* (CLIENT)
       │    └─ memory.task.* (INTERNAL)
       │
       ├─ tool.resolve_project (INTERNAL)
       │    └─ http.bridge.* (CLIENT)
       │
       └─ memory.note.* (INTERNAL)
```

### Relationship Rules

**Valid parent-child relationships** (represented as edges in the canvas):

1. `mcp.request` → `tool.execute`
   - MCP requests invoke tool execution

2. `tool.execute` → `tool.submit_dependency_task.*`, `tool.resolve_project`
   - Generic tool wrapper delegates to specific tool implementations

3. `tool.submit_dependency_task.*` → `http.bridge.*`, `memory.task.*`
   - Dependency task submission calls ADE bridge and creates local tracking

4. `tool.resolve_project` → `http.bridge.*`
   - Project resolution queries ADE bridge

5. `tool.execute` → `memory.note.*`
   - Tools may add memory notes

**Invalid relationships** (no edges, should not occur):

- `http.bridge.*` → any other span
  - Bridge calls are leaf operations (CLIENT spans don't have children in this service)

- `memory.*` → `tool.*`
  - Infrastructure doesn't call domain logic (reverse dependency)

- `http.bridge.*` → `memory.*`
  - Bridge and Memory Palace don't interact directly

## Span Attributes

### Common Attributes

All spans include:
- `service.name`: `"principal-mcp"`
- `service.version`: Package version
- Trace and span IDs from OTEL SDK

### Pattern-Specific Attributes

**mcp.request**:
- `mcp.method`: Request method (list_tools, call_tool, etc.)
- `mcp.params`: Serialized request parameters

**tool.execute**:
- `tool.name`: Tool identifier (submit_dependency_task, resolve_project, etc.)
- `tool.input_schema`: JSON schema of tool inputs

**http.bridge.\***:
- `http.method`: HTTP method (GET, POST)
- `http.url`: Full request URL
- `http.status_code`: Response status
- `http.response_size`: Response size in bytes

**memory.task.\***:
- `memory.task_id`: Generated task ID
- `memory.repository_root`: Repository path
- `memory.task_status`: Task status (To Do, In Progress, Done)

**memory.note.\***:
- `memory.note_id`: Generated note ID
- `memory.anchors`: Number of file anchors
- `memory.tags`: Associated tags

## Error Handling

### Span Status

Spans use OTEL status codes:
- `OK`: Operation completed successfully
- `ERROR`: Operation failed (includes error message and stack trace)

### Error Scenarios

| Scenario | Span Status | Error Attributes |
|----------|-------------|------------------|
| Bridge unreachable | ERROR | `error.type=NetworkError`, `error.message` |
| Tool input validation failed | ERROR | `error.type=ValidationError`, `error.schema_violations` |
| Memory Palace write failed | ERROR | `error.type=FileSystemError`, `error.path` |

### Fallback Behavior

When `http.bridge.*` spans fail with network errors:
- Parent `tool.submit_dependency_task.*` span may still succeed
- Falls back to `memory.task.create` for local-only tracking
- Fallback is indicated via `tool.fallback_mode=true` attribute

## Design Decisions

### Why Wildcard Patterns?

Patterns like `tool.submit_dependency_task.*` allow sub-operations to be represented without pre-defining every possible span name. This provides:

- **Flexibility**: Add new sub-operations without updating conventions
- **Grouping**: Query all dependency task operations with a single pattern
- **Clarity**: Hierarchical naming makes parent-child relationships obvious

### Why Separate HTTP and Memory Spans?

Even though both are infrastructure concerns, they serve different purposes:

- **http.bridge.\***: External service dependency (may be unavailable)
- **memory.\***: Local persistence (always available as fallback)

Separating them allows:
- Independent monitoring of bridge availability
- Clear visualization of fallback behavior
- Different retry and timeout policies

### Span Granularity

We emit spans at the **operation** level (e.g., `tool.execute`, `http.bridge.request`) rather than function-level because:

- Aligns with business operations
- Reduces trace noise
- Makes traces easier to understand
- Focuses on user-visible latency

Internal function calls within a tool are not separately instrumented unless they represent significant sub-operations.

## Future Extensions

As the service evolves, consider adding:

- `validation.*` spans for input validation
- `transform.*` spans for data transformation
- `cache.*` spans for caching layer (if added)
- Specific event markers for important state changes
