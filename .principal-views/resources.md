# Service Resources & Instrumentation Scopes

## Overview

This document describes the OpenTelemetry resources and instrumentation scopes for the `principal-mcp` project - an MCP (Model Context Protocol) server that provides task management and project resolution capabilities for PrincipalMD.

## Resources

| Resource | Service Name | Description |
|----------|--------------|-------------|
| `principal-mcp` | `principal-mcp` | MCP server providing tools for dependency task submission, upstream task submission, project resolution, and Memory Palace integration |

### Resource Attributes

The `principal-mcp` resource emits telemetry with the following standard attributes:

| Attribute | Example Value | Description |
|-----------|---------------|-------------|
| `service.name` | `principal-mcp` | Logical service name |
| `service.version` | `0.0.6` | Service version from package.json |
| `deployment.environment` | `development` | Deployment environment (derived from NODE_ENV) |

## Instrumentation Scopes

Following OTEL best practices, this service uses one instrumentation scope per resource. The scope identifies the instrumentation library, not individual features or modules.

| Scope | Resource | Operations Covered |
|-------|----------|-------------------|
| `principal-mcp` | `principal-mcp` | MCP server lifecycle, tool handlers, HTTP bridge communication, Memory Palace operations |

### Scope Coverage

The `principal-mcp` instrumentation scope covers:

- **MCP Server Operations**: Server startup, shutdown, request handling (list_tools, call_tool, list_resources, read_resource)
- **Tool Execution**: Dependency task submission, upstream task submission, project resolution
- **Bridge Communication**: HTTP requests to the ADE bridge for remote task coordination
- **Memory Palace Operations**: Local task tracking, memory note creation

## Design Decisions

### Why One Scope Per Resource?

Following OpenTelemetry semantic conventions, instrumentation scopes identify **instrumentation libraries**, not features or modules. Since all telemetry in this service comes from a single instrumentation package (`principal-mcp`), we use a single scope.

Different operations are differentiated via **span names** rather than separate scopes. This approach:

- Simplifies trace visualization
- Follows OTEL semantic conventions
- Makes it easier to query and filter spans
- Reduces configuration overhead

### Service Boundary

The `principal-mcp` service acts as a bridge between LLM clients (via MCP protocol) and the PrincipalMD ecosystem. It:

- Accepts MCP requests via stdio transport
- Routes operations to appropriate tools
- Communicates with ADE bridge over HTTP when available
- Falls back to local Memory Palace storage when offline

This service boundary is reflected in the span architecture (see `architecture.spans.canvas`).
