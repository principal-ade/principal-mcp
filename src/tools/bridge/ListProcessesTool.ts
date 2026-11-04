import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({});

export class ListProcessesTool extends BaseTool<{}, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'list_processes';
  description = 'List managed processes (dev servers, watchers, tasks).';
  schema = Schema;

  async execute(): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'GET', '/api/processes');
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}