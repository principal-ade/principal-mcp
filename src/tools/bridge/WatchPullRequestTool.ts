import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  pr: z.string().min(1).describe('PR URL or owner/repo#123.'),
});

type Input = z.infer<typeof Schema>;

export class WatchPullRequestTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'watch_pull_request';
  description = 'Watch a GitHub pull request so the app polls its status.';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'POST', '/api/pull-requests/watch', { pr: input.pr });
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}