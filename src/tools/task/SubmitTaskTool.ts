import { z } from 'zod';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';

interface SubmitTaskResult {
  success: boolean;
  taskId?: string;
  repository?: string;
  persistedOffline?: boolean;
  message?: string;
}

const SubmitTaskSchema = z.object({
  dependencyId: z.string().min(1, 'dependencyId is required'),
  repositoryRoot: z.string().optional(),
  taskSummary: z.string().min(1, 'taskSummary is required'),
  taskDetails: z.string().min(1, 'taskDetails is required'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  tags: z.array(z.string().min(1)).optional(),
  anchors: z.array(z.string().min(1)).optional(),
});

type SubmitTaskInput = z.infer<typeof SubmitTaskSchema>;

export class SubmitTaskTool extends BaseTool<SubmitTaskInput, SubmitTaskResult> {
  constructor(config: McpServerConfig) {
    super(config);
  }

  name = 'submit_task';
  description =
    'Submit a task to ADE, falling back to configurable pending queue when offline.';
  schema = SubmitTaskSchema;

  async execute(input: SubmitTaskInput): Promise<McpToolResult<SubmitTaskResult>> {
    const payload = await this.trySubmitToAde(input);
    if (payload.success) {
      return this.createSuccessResponse('Task submitted successfully.', payload);
    }

    try {
      const fallback = this.persistTaskLocally(input);
      return this.createSuccessResponse(
        'ADE bridge unavailable. Task persisted locally for pickup.',
        fallback,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to persist task locally.';
      return this.createErrorResponse(message);
    }
  }

  private async trySubmitToAde(input: SubmitTaskInput): Promise<SubmitTaskResult> {
    const bridgeHost = this.config.bridgeHost ?? 'localhost';
    const bridgePort = this.config.bridgePort ?? 3044;
    const protocol = process.env.PRINCIPLE_MCP_PROTOCOL ?? 'http';
    // CRITICAL: Use /tasks/submit endpoint (NOT /dependencies/submit)
    const endpoint = this.resolvePath('/tasks/submit');
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

      const data = (await response.json()) as SubmitTaskResult;
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

  private persistTaskLocally(input: SubmitTaskInput): SubmitTaskResult {
    if (!input.repositoryRoot) {
      throw new Error(
        'repositoryRoot is required when ADE bridge is unavailable to persist tasks locally.',
      );
    }

    // Resolve pending queue path
    const pendingQueuePath = this.resolvePendingQueuePath(input.repositoryRoot);

    // Ensure directory exists
    if (!fs.existsSync(pendingQueuePath)) {
      fs.mkdirSync(pendingQueuePath, { recursive: true });
    }

    // Generate task ID and create task payload
    const taskId = randomUUID();
    const taskPayload = {
      taskId,
      timestamp: new Date().toISOString(),
      repositoryRoot: input.repositoryRoot,
      dependencyId: input.dependencyId,
      taskSummary: input.taskSummary,
      taskDetails: input.taskDetails,
      priority: input.priority ?? 'normal',
      tags: input.tags ?? [],
      anchors: input.anchors ?? [],
    };

    // Write task to JSON file
    const fileName = `task-${taskId}.json`;
    const filePath = path.join(pendingQueuePath, fileName);
    fs.writeFileSync(filePath, JSON.stringify(taskPayload, null, 2), 'utf-8');

    return {
      success: true,
      taskId,
      repository: input.repositoryRoot,
      persistedOffline: true,
      message: `Task queued in pending queue at ${pendingQueuePath}`,
    };
  }

  private resolvePendingQueuePath(repositoryRoot: string): string {
    // Priority: config.pendingQueuePath > default
    if (this.config.pendingQueuePath) {
      // Use configured path (must be absolute)
      const configPath = this.expandHomeDirectory(this.config.pendingQueuePath);
      if (!path.isAbsolute(configPath)) {
        throw new Error(
          `Configured pending queue path must be absolute: ${this.config.pendingQueuePath}`,
        );
      }
      return configPath;
    }

    // Default: {repositoryRoot}/.mcp-pending
    return path.join(repositoryRoot, '.mcp-pending');
  }

  private expandHomeDirectory(filePath: string): string {
    if (filePath.startsWith('~/') || filePath === '~') {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) {
        throw new Error('Unable to resolve home directory');
      }
      return filePath.replace(/^~/, homeDir);
    }
    return filePath;
  }
}
