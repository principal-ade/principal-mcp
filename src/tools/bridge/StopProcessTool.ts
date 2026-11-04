import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  id: z.string().min(1).describe('Managed process id.'),
});

type Input = z.infer<typeof Schema>;

export class StopProcessTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'stop_process';
  description = 'Stop a managed process.';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'POST', `/api/processes/${encodeURIComponent(input.id)}/stop`);
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}