# Project Resolver

## Overview

The Project Resolver is a comprehensive intelligence system for understanding projects, their capabilities, and their local/remote presence. It provides AI agents and development tools with the information needed to make smart decisions about task routing, clone selection, and permission-aware operations.

## Purpose

Instead of blindly attempting operations that might fail due to permissions or missing dependencies, the Project Resolver enables:

1. **Smart Task Routing**: Determine the best system for submitting work (ADE, GitHub issues, PRs, etc.)
2. **Clone Discovery**: Find all local copies of a project and identify the primary working directory
3. **Permission Intelligence**: Know what operations are allowed before attempting them
4. **Integration Awareness**: Understand which external systems are connected
5. **State Visibility**: See current branch, uncommitted changes, and last activity

## Using the Tool

### MCP Tool Usage

The Project Resolver is available as an MCP tool named `resolve_project`. It can be called directly by AI agents or through MCP clients.

**Tool Name**: `resolve_project`

**Parameters**:
```typescript
{
  projectId: string;           // Required: Project identifier
  repositoryRoot?: string;     // Optional: Context path for resolution
  includeRemoteInfo?: boolean; // Optional: Fetch remote metadata (default: false)
}
```

**Example Usage in Claude.md**:
```typescript
// Query a project
const result = await mcp.call_tool('resolve_project', {
  projectId: 'auth-service',
  includeRemoteInfo: true
});

// Use the results to make decisions
if (result.capabilities?.canSubmitTasks) {
  console.log(`✅ Can submit tasks to ADE`);
} else if (result.capabilities?.canCreateIssues) {
  console.log(`📝 Can create GitHub issues: ${result.remote?.url}/issues/new`);
}
```

**Note**: The tool requires a running bridge server to provide project intelligence. If the bridge is unavailable, the tool will return an error message with guidance.

## Core Capabilities

### 1. Project Metadata

Provides essential information about the project:

```typescript
{
  name: string;              // Project name
  description?: string;      // Human-readable description
  tags?: string[];          // Categorization tags
  type: "repository" | "package" | "workspace";
  primaryLanguage?: string; // Main programming language
  framework?: string;       // Primary framework/platform
}
```

**Use Cases:**
- Display context-aware information to users
- Filter and categorize projects
- Understand technology stack for better assistance

### 2. Capability Detection

Determines what operations are permitted:

```typescript
{
  canSubmitTasks: boolean;    // Can create tasks in ADE
  canCreateIssues: boolean;   // Can create GitHub/GitLab issues
  canCreatePRs: boolean;      // Can submit pull requests
  canReadCode: boolean;       // Has read access to source code
  canWriteCode: boolean;      // Has write access (can commit)
  integrations?: string[];    // Connected systems: ["github", "ade", "alexandria"]
}
```

**Use Cases:**
- Route work to appropriate systems (ADE vs GitHub vs local notes)
- Prevent operations that will fail due to lack of permissions
- Suggest alternatives when primary action is unavailable
- Enable/disable UI features based on capabilities

### 3. Local Clone Discovery

Finds all local copies of a project:

```typescript
{
  localClones: [
    {
      path: string;                  // Absolute path to clone
      isPrimary: boolean;            // Main working copy flag
      lastModified?: string;         // Last git activity (ISO 8601)
      branch?: string;               // Current branch name
      isDirty?: boolean;             // Has uncommitted changes
      alexandriaRegistered: boolean; // In Alexandria registry
    }
  ]
}
```

**Use Cases:**
- Ask user which clone to use when multiple exist
- Auto-select the primary working copy for operations
- Warn about uncommitted changes before operations
- Navigate to the correct directory for file operations
- Identify orphaned or duplicate clones

### 4. Remote Repository Information

Provides details about the remote origin:

```typescript
{
  remote: {
    url?: string;              // Git remote URL
    platform?: "github" | "gitlab" | "bitbucket" | "other";
    owner?: string;            // Repository owner/org
    repoName?: string;         // Repository name
    isPrivate?: boolean;       // Privacy status
  }
}
```

**Use Cases:**
- Generate links to GitHub/GitLab issues or PRs
- Determine which API to use for remote operations
- Check if remote collaboration is possible
- Display remote repository information

## API Endpoint

### POST /projects/resolve

**Request:**
```typescript
{
  projectId: string;           // Required: Project identifier
  repositoryRoot?: string;     // Optional: Context path for resolution
  includeRemoteInfo?: boolean; // Optional: Fetch remote metadata (slower)
}
```

**Response:**
```typescript
{
  success: boolean;
  found: boolean;
  projectId: string;
  project?: { /* metadata */ };
  capabilities?: { /* permissions */ };
  localClones?: [ /* clone info */ ];
  remote?: { /* remote info */ };
  suggestions?: string[];      // If not found or limited
  message?: string;
}
```

See [HTTP_API.md](./HTTP_API.md#3-resolve-project) for complete API documentation.

## Implementation Guide

### Data Sources

The Project Resolver should query multiple sources:

1. **Alexandria Registry** - Registered repositories with metadata
2. **Local Filesystem** - Scan for `.git` directories and `package.json` files
3. **Git Configuration** - Extract remote URLs, current branch, status
4. **GitHub/GitLab APIs** - Fetch remote metadata (when `includeRemoteInfo: true`)
5. **Package Managers** - Check `node_modules`, Python site-packages, etc.
6. **ADE Registry** - Check if project is registered in ADE

### Resolution Strategy

```
1. Check Alexandria registry first (fastest, most complete)
   ├─ If found → Gather metadata, check permissions
   └─ If not found → Continue to next source

2. Search local filesystem
   ├─ Look for .git directories matching projectId
   ├─ Check package.json, setup.py, etc. for name matches
   └─ Record all matches

3. Query Git for each local clone
   ├─ Get current branch
   ├─ Check for uncommitted changes (git status --porcelain)
   ├─ Get last commit timestamp
   └─ Extract remote URL

4. If includeRemoteInfo: true
   ├─ Parse remote URL for platform/owner/repo
   ├─ Call GitHub/GitLab API for metadata
   └─ Check repository permissions

5. Determine capabilities
   ├─ canSubmitTasks: Check ADE integration
   ├─ canCreateIssues/PRs: Check Git platform + permissions
   ├─ canReadCode: Verify file access
   └─ canWriteCode: Check git write permissions

6. Identify primary clone
   ├─ Prefer Alexandria-registered paths
   ├─ Choose most recently active
   └─ Mark isDirty for uncommitted changes
```

### Performance Considerations

- **Fast Path**: Alexandria + local filesystem only (~10-50ms)
- **Slow Path**: Include remote API calls (~200-1000ms)
- **Caching**: Cache remote API responses for 5-15 minutes
- **Parallelization**: Query data sources concurrently
- **Lazy Loading**: Only fetch expensive data when needed

## Usage Examples

### Example 1: Smart Task Routing

```typescript
// Agent wants to submit work for "auth-service"
const result = await resolveProject({ projectId: "auth-service" });

if (result.capabilities?.canSubmitTasks) {
  // Submit to ADE
  await submitTask({ dependencyId: "auth-service", ... });
} else if (result.capabilities?.canCreateIssues) {
  // Suggest creating GitHub issue
  console.log(`Cannot submit to ADE. Create issue: ${result.remote.url}/issues/new`);
} else {
  // Fallback to local notes
  await addMemoryNote({ note: "Work needed: ...", ... });
}
```

### Example 2: Clone Selection

```typescript
// Agent needs to read code from "frontend-app"
const result = await resolveProject({ projectId: "frontend-app" });

if (result.localClones?.length > 1) {
  // Ask user which clone to use
  const primary = result.localClones.find(c => c.isPrimary);
  console.log(`Using primary clone: ${primary.path}`);
} else if (result.localClones?.length === 1) {
  // Use the only clone
  const clone = result.localClones[0];
  if (clone.isDirty) {
    console.warn("Warning: Clone has uncommitted changes");
  }
  // Proceed with operations in clone.path
} else {
  // No local clone - suggest cloning
  console.log(`Clone from: git clone ${result.remote.url}`);
}
```

### Example 3: Permission Checking

```typescript
// Before attempting to create a PR
const result = await resolveProject({
  projectId: "shared-library",
  includeRemoteInfo: true
});

if (!result.capabilities?.canCreatePRs) {
  if (result.remote?.isPrivate && !result.capabilities?.canReadCode) {
    console.error("No access to this private repository");
  } else {
    console.log("You have read-only access. Fork to contribute:");
    console.log(`${result.remote.url}/fork`);
  }
  return;
}

// Safe to proceed with PR creation
await createPullRequest({ ... });
```

### Example 4: Status Overview

```typescript
// Display project status to user
const result = await resolveProject({
  projectId: "api-server",
  includeRemoteInfo: true
});

console.log(`Project: ${result.project.name}`);
console.log(`Description: ${result.project.description}`);
console.log(`Type: ${result.project.type} (${result.project.primaryLanguage})`);
console.log();
console.log(`Local Clones:`);
result.localClones.forEach(clone => {
  const status = clone.isDirty ? "🔴 Dirty" : "🟢 Clean";
  const primary = clone.isPrimary ? "⭐ Primary" : "";
  console.log(`  ${status} ${clone.path} [${clone.branch}] ${primary}`);
});
console.log();
console.log(`Capabilities:`);
console.log(`  Submit Tasks: ${result.capabilities.canSubmitTasks ? "✅" : "❌"}`);
console.log(`  Create PRs: ${result.capabilities.canCreatePRs ? "✅" : "❌"}`);
console.log(`  Write Code: ${result.capabilities.canWriteCode ? "✅" : "❌"}`);
console.log();
console.log(`Remote: ${result.remote?.url || "None"}`);
if (result.remote?.platform) {
  console.log(`Platform: ${result.remote.platform} (${result.remote.isPrivate ? "Private" : "Public"})`);
}
```

## Integration with MCP Tools

The Project Resolver is designed to be called **before** taking actions:

```typescript
// Before: Blindly submit task
await submitDependencyTask({ dependencyId: "some-project", ... });
// ❌ Might fail, create tasks in wrong place, or duplicate work

// After: Smart routing with project resolver
const info = await resolveProject({ projectId: "some-project" });

if (info.capabilities.canSubmitTasks) {
  await submitTask({ dependencyId: "some-project", ... });
} else if (info.capabilities.canCreateIssues) {
  const issueUrl = await createGitHubIssue({ repo: info.remote.url, ... });
  console.log(`Created issue: ${issueUrl}`);
} else {
  await addMemoryNote({
    note: "Task for review: ...",
    anchors: [info.localClones[0]?.path],
    ...
  });
}
// ✅ Work routed to the right place
```

## Security & Privacy

### Sensitive Information

The Project Resolver may expose:

- **File paths**: Absolute paths to local clones
- **Remote URLs**: May include credentials if configured in git
- **Branch names**: Could reveal internal project structure
- **Repository metadata**: Description, tags, etc.

**Recommendations:**

1. **Sanitize Git URLs**: Remove embedded credentials before returning
2. **Path Filtering**: Allow configuration of which paths to expose
3. **Access Control**: Implement authentication on the HTTP endpoint
4. **Rate Limiting**: Prevent abuse of remote API calls
5. **Audit Logging**: Log all resolver queries for security review

### Permission Model

The resolver should respect:

- **File system permissions**: Only read accessible directories
- **Git configuration**: Honor configured access controls
- **API tokens**: Use user's GitHub/GitLab tokens for permission checks
- **Alexandria ACLs**: Respect repository access controls in Alexandria

## Testing

### Test Scenarios

1. **Found in Alexandria with full metadata**
   - Should return complete project info
   - Should include all capabilities
   - Should find local clones

2. **Found as npm package (read-only)**
   - Should return limited capabilities
   - Should mark as type: "package"
   - Should not allow write operations

3. **Multiple local clones**
   - Should identify primary clone correctly
   - Should report status of each clone
   - Should detect uncommitted changes

4. **Not found**
   - Should return found: false
   - Should provide helpful suggestions
   - Should not error

5. **Remote API failure**
   - Should gracefully degrade
   - Should return local info only
   - Should indicate partial results

6. **Permission denied**
   - Should return limited capabilities
   - Should suggest alternatives
   - Should not expose forbidden paths

### Mock Responses

See [tests/project-resolver.test.ts](../tests/project-resolver.test.ts) for comprehensive test cases.

## Future Enhancements

### Planned Features

1. **Workspace Detection**: Detect monorepos and workspaces
2. **Dependency Graphs**: Map dependencies between projects
3. **Recent Activity**: Show recent commits, PRs, issues
4. **Team Information**: List contributors and maintainers
5. **CI/CD Status**: Include build and deployment status
6. **Health Metrics**: Code coverage, test pass rate, etc.
7. **Smart Suggestions**: AI-powered recommendations for next actions

### API Extensions

Future endpoint additions:

- `POST /projects/search` - Full-text search across projects
- `POST /projects/compare` - Compare two projects
- `GET /projects/recent` - List recently accessed projects
- `POST /projects/watch` - Subscribe to project changes

## Related Documentation

- [HTTP_API.md](./HTTP_API.md) - Complete API reference
- [mcp-tools-design.md](./mcp-tools-design.md) - MCP tool architecture
- [configurable-pending-queue.md](./configurable-pending-queue.md) - Task queue design

## Support

For questions or issues:

- GitHub Issues: https://github.com/your-org/principal-mcp/issues
- Package: `@principal-ai/principal-mcp`

---

**Version**: 0.0.5
**Status**: Active - Available as MCP Tool
**MCP Tool Name**: `resolve_project`
**API Endpoint**: `POST /projects/resolve`
