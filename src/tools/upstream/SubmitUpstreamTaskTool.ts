import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';

interface SubmitUpstreamTaskResult {
  success: boolean;
  taskId?: string;
  repository?: string;
  message?: string;
}

interface AdeSubmitResponse {
  success: boolean;
  taskId?: string;
  repository?: string;
  message?: string;
}

const SubmitUpstreamTaskSchema = z.object({
  upstreamId: z.string().min(1, 'upstreamId is required'),
  taskSummary: z.string().min(1, 'taskSummary is required'),
  taskDetails: z.string().min(1, 'taskDetails is required'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  tags: z.array(z.string().min(1)).optional(),
  anchors: z.array(z.string().min(1)).optional(),
});

type SubmitUpstreamTaskInput = z.infer<typeof SubmitUpstreamTaskSchema>;

export class SubmitUpstreamTaskTool extends BaseTool<
  SubmitUpstreamTaskInput,
  SubmitUpstreamTaskResult
> {
  constructor(config: McpServerConfig) {
    super(config);
  }

  name = 'submit_upstream_task';
  description = 'Notify an upstream repository of changes or request action via ADE.';
  schema = SubmitUpstreamTaskSchema;

  async execute(
    input: SubmitUpstreamTaskInput,
  ): Promise<McpToolResult<SubmitUpstreamTaskResult>> {
    const result = await this.submitToAde(input);

    if (!result.success) {
      return this.createErrorResponse(
        result.message ?? 'Failed to submit task to upstream via ADE bridge.',
      );
    }

    return this.createSuccessResponse('Upstream task submitted successfully.', {
      success: true,
      taskId: result.taskId,
      repository: result.repository,
      message: result.message,
    });
  }

  private async submitToAde(
    input: SubmitUpstreamTaskInput,
  ): Promise<AdeSubmitResponse> {
    const bridgeHost = this.config.bridgeHost ?? 'localhost';
    const bridgePort = this.config.bridgePort ?? 3044;
    const protocol = process.env.PRINCIPLE_MCP_PROTOCOL ?? 'http';
    const endpoint = this.resolvePath('/upstream/submit');
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
}
