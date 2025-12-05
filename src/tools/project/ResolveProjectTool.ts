import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';

interface ProjectMetadata {
  name: string;
  description?: string;
  tags?: string[];
  type?: 'repository' | 'package' | 'workspace';
  primaryLanguage?: string;
  framework?: string;
}

interface ProjectCapabilities {
  canSubmitTasks: boolean;
  canCreateIssues: boolean;
  canCreatePRs: boolean;
  canReadCode: boolean;
  canWriteCode: boolean;
  integrations?: string[];
}

interface LocalClone {
  path: string;
  isPrimary: boolean;
  lastModified?: string;
  branch?: string;
  isDirty?: boolean;
  alexandriaRegistered: boolean;
}

interface RemoteInfo {
  url?: string;
  platform?: 'github' | 'gitlab' | 'bitbucket' | 'other';
  owner?: string;
  repoName?: string;
  isPrivate?: boolean;
}

interface ResolveProjectResult {
  success: boolean;
  found: boolean;
  projectId: string;
  project?: ProjectMetadata;
  capabilities?: ProjectCapabilities;
  localClones?: LocalClone[];
  remote?: RemoteInfo;
  suggestions?: string[];
  message?: string;
  error?: string;
}

const ResolveProjectSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  repositoryRoot: z.string().optional(),
  includeRemoteInfo: z.boolean().optional().default(false),
});

type ResolveProjectInput = z.infer<typeof ResolveProjectSchema>;

export class ResolveProjectTool extends BaseTool<z.input<typeof ResolveProjectSchema>, ResolveProjectResult> {
  constructor(config: McpServerConfig) {
    super(config);
  }

  name = 'resolve_project';
  description =
    'Get comprehensive project information including metadata, permissions, local clones, and remote details. Use this to make smart decisions about task routing, clone selection, and permission-aware operations.';
  schema = ResolveProjectSchema;

  async execute(input: ResolveProjectInput): Promise<McpToolResult<ResolveProjectResult>> {
    const result = await this.queryProject(input);

    if (result.success) {
      return this.createSuccessResponse(
        result.message || 'Project resolution completed.',
        result,
      );
    }

    return this.createErrorResponse(
      result.error || result.message || 'Failed to resolve project.',
    );
  }

  private async queryProject(input: ResolveProjectInput): Promise<ResolveProjectResult> {
    const bridgeHost = this.config.bridgeHost ?? 'localhost';
    const bridgePort = this.config.bridgePort ?? 3044;
    const protocol = process.env.PRINCIPLE_MCP_PROTOCOL ?? 'http';
    const endpoint = this.resolvePath('/projects/resolve');
    const url = `${protocol}://${bridgeHost}:${bridgePort}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`Bridge responded with status ${response.status}`);
      }

      return (await response.json()) as ResolveProjectResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        found: false,
        projectId: input.projectId,
        error: message,
        message: `Failed to query project: ${message}. Ensure the bridge server is running.`,
      };
    }
  }
}
