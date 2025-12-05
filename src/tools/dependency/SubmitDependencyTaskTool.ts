import { MemoryPalace } from '@principal-ai/alexandria-core-library';
import { NodeFileSystemAdapter } from '@principal-ai/alexandria-core-library/node';
import { z } from 'zod';

import type {
  CreateTaskInput,
  ValidatedRelativePath,
  ValidatedRepositoryPath,
} from '@principal-ai/alexandria-core-library';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';

interface SubmitDependencyTaskResult {
  success: boolean;
  taskId?: string;
  repository?: string;
  persistedOffline?: boolean;
  message?: string;
}

const SubmitDependencyTaskSchema = z.object({
  dependencyId: z.string().min(1, 'dependencyId is required'),
  repositoryRoot: z.string().optional(),
  taskSummary: z.string().min(1, 'taskSummary is required'),
  taskDetails: z.string().min(1, 'taskDetails is required'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  tags: z.array(z.string().min(1)).optional(),
  anchors: z.array(z.string().min(1)).optional(),
});

type SubmitDependencyTaskInput = z.infer<typeof SubmitDependencyTaskSchema>;

export class SubmitDependencyTaskTool extends BaseTool<
  SubmitDependencyTaskInput,
  SubmitDependencyTaskResult
> {
  constructor(config: McpServerConfig) {
    super(config);
  }

  name = 'submit_dependency_task';
  description = 'Submit a dependency task to ADE, falling back to Memory Palace when offline.';
  schema = SubmitDependencyTaskSchema;

  async execute(input: SubmitDependencyTaskInput): Promise<
    McpToolResult<SubmitDependencyTaskResult>
  > {
    const payload = await this.trySubmitToAde(input);
    if (payload.success) {
      return this.createSuccessResponse('Dependency task submitted successfully.', payload);
    }

    try {
      const fallback = this.persistTaskLocally(input);
      return this.createSuccessResponse(
        'ADE bridge unavailable. Task persisted locally for pickup.',
        fallback,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to persist dependency task locally.';
      return this.createErrorResponse(message);
    }
  }

  private async trySubmitToAde(
    input: SubmitDependencyTaskInput,
  ): Promise<SubmitDependencyTaskResult> {
    const bridgeHost = this.config.bridgeHost ?? 'localhost';
    const bridgePort = this.config.bridgePort ?? 3044;
    const protocol = process.env.PRINCIPLE_MCP_PROTOCOL ?? 'http';
    const endpoint = this.resolvePath('/dependencies/submit');
    const url = `${protocol}://${bridgeHost}:${bridgePort}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`ADE bridge responded with status ${response.status}`);
      }

      const data = (await response.json()) as SubmitDependencyTaskResult;
      return {
        success: true,
        taskId: data.taskId,
        repository: data.repository ?? input.repositoryRoot,
        persistedOffline: false,
        message: data.message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  private persistTaskLocally(input: SubmitDependencyTaskInput): SubmitDependencyTaskResult {
    if (!input.repositoryRoot) {
      throw new Error(
        'repositoryRoot is required when ADE bridge is unavailable to persist dependency tasks locally.',
      );
    }

    const fsAdapter = new NodeFileSystemAdapter();
    const validatedRoot = MemoryPalace.validateRepositoryPath(
      fsAdapter,
      input.repositoryRoot,
    ) as ValidatedRepositoryPath;
    const palace = new MemoryPalace(validatedRoot, fsAdapter);

    const relativeAnchors = this.toRelativeAnchors(fsAdapter, validatedRoot, input.anchors ?? []);
    const directoryPath = this.resolveDirectoryPath(fsAdapter, validatedRoot, relativeAnchors);
    const content = this.composeTaskContent(input.taskSummary, input.taskDetails);

    const taskInput: CreateTaskInput = {
      content,
      directoryPath,
      priority: input.priority,
      tags: input.tags,
      anchors: relativeAnchors,
    };

    const senderId = fsAdapter.getRepositoryName(validatedRoot);
    const task = palace.receiveTask(taskInput, senderId);

    return {
      success: true,
      taskId: task.id,
      repository: validatedRoot,
      persistedOffline: true,
      message: 'Task queued in local Memory Palace work queue.',
    };
  }

  private toRelativeAnchors(
    fsAdapter: NodeFileSystemAdapter,
    repositoryRoot: ValidatedRepositoryPath,
    anchors: string[],
  ): string[] {
    return anchors.map(anchor => {
      const absolute = fsAdapter.isAbsolute(anchor)
        ? anchor
        : fsAdapter.join(repositoryRoot, anchor);
      const relative = MemoryPalace.validateRelativePath(repositoryRoot, absolute, fsAdapter);
      return relative as unknown as string;
    });
  }

  private resolveDirectoryPath(
    fsAdapter: NodeFileSystemAdapter,
    repositoryRoot: ValidatedRepositoryPath,
    anchors: string[],
  ): ValidatedRelativePath {
    if (!anchors.length) {
      return '' as ValidatedRelativePath;
    }

    const firstAnchor = anchors[0];
    const anchorAbsolute = fsAdapter.join(repositoryRoot, firstAnchor);
    const directoryAbsolute = fsAdapter.dirname(anchorAbsolute);
    return MemoryPalace.validateRelativePath(repositoryRoot, directoryAbsolute, fsAdapter);
  }

  private composeTaskContent(summary: string, details: string): string {
    const trimmedDetails = details.trim();
    if (!trimmedDetails) {
      return `# ${summary}`;
    }
    return trimmedDetails.startsWith('#')
      ? trimmedDetails
      : `# ${summary}\n\n${trimmedDetails}`;
  }
}
