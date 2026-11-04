import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({});

export class ListWatchedPullRequestsTool extends BaseTool<{}, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'list_watched_pull_requests';
  description = 'List watched pull requests with latest snapshots.';
  schema = Schema;

  async execute(): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'GET', '/api/pull-requests/watch');
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}