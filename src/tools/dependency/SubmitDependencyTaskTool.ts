import { Core } from '@backlog-md/core';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';
import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';

interface SubmitDependencyTaskResult {
  success: boolean;
  taskId?: string;
  remoteRepository?: string;
  localTrackingTaskId?: string;
  message?: string;
}

interface AdeSubmitResponse {
  success: boolean;
  taskId?: string;
  repository?: string;
  message?: string;
}

const SubmitDependencyTaskSchema = z.object({
  dependencyId: z.string().min(1, 'dependencyId is required'),
  repositoryRoot: z.string().min(1, 'repositoryRoot is required'),
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
  description =
    'Submit a task to a dependency repository via ADE and create a local tracking entry.';
  schema = SubmitDependencyTaskSchema;

  async execute(
    input: SubmitDependencyTaskInput,
  ): Promise<McpToolResult<SubmitDependencyTaskResult>> {
    // Submit to ADE
    const adeResult = await this.submitToAde(input);
    if (!adeResult.success) {
      return this.createErrorResponse(
        adeResult.message ?? 'Failed to submit task to ADE bridge.',
      );
    }

    // Create local tracking entry in backlog
    try {
      const trackingTaskId = await this.createLocalTrackingEntry(input, adeResult);
      return this.createSuccessResponse('Dependency task submitted and tracked locally.', {
        success: true,
        taskId: adeResult.taskId,
        remoteRepository: adeResult.repository,
        localTrackingTaskId: trackingTaskId,
        message: `Task ${adeResult.taskId} created in ${adeResult.repository}. Tracking entry created locally.`,
      });
    } catch (error) {
      // ADE succeeded but local tracking failed - still return success with warning
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.createSuccessResponse(
        'Dependency task submitted but local tracking failed.',
        {
          success: true,
          taskId: adeResult.taskId,
          remoteRepository: adeResult.repository,
          message: `Task created in ${adeResult.repository} but failed to create local tracking entry: ${message}`,
        },
      );
    }
  }

  private async submitToAde(
    input: SubmitDependencyTaskInput,
  ): Promise<AdeSubmitResponse> {
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
        return {
          success: false,
          message: `ADE bridge responded with status ${response.status}`,
        };
      }

      const data = (await response.json()) as AdeSubmitResponse;
      return {
        success: true,
        taskId: data.taskId,
        repository: data.repository,
        message: data.message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  private async createLocalTrackingEntry(
    input: SubmitDependencyTaskInput,
    adeResult: AdeSubmitResponse,
  ): Promise<string> {
    const fsAdapter = new NodeFileSystemAdapter();
    const core = new Core({
      projectRoot: input.repositoryRoot,
      adapters: { fs: fsAdapter },
    });

    await core.initialize();

    const task = await core.createTask({
      title: `[Dependency] ${input.taskSummary}`,
      status: 'To Do',
      priority: this.mapPriority(input.priority),
      labels: ['dependency-task', input.dependencyId, ...(input.tags ?? [])],
      description: this.composeTrackingDescription(input, adeResult),
    });

    return task.id;
  }

  private mapPriority(
    priority?: 'low' | 'normal' | 'high' | 'critical',
  ): 'low' | 'medium' | 'high' | undefined {
    switch (priority) {
      case 'critical':
      case 'high':
        return 'high';
      case 'normal':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return undefined;
    }
  }

  private composeTrackingDescription(
    input: SubmitDependencyTaskInput,
    adeResult: AdeSubmitResponse,
  ): string {
    const lines = [
      `**Dependency:** ${input.dependencyId}`,
      `**Remote Task ID:** ${adeResult.taskId}`,
      `**Remote Repository:** ${adeResult.repository}`,
      '',
      '---',
      '',
      input.taskDetails,
    ];

    if (input.anchors?.length) {
      lines.push('', '**Related files:**');
      for (const anchor of input.anchors) {
        lines.push(`- ${anchor}`);
      }
    }

    return lines.join('\n');
  }
}
