import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  command: z.string().min(1).describe('Command binary (npm, bun, vite, ...).'),
  cwd: z.string().min(1).describe('Absolute path inside a registered repository.'),
  args: z.array(z.string()).optional(),
  label: z.string().optional(),
  kind: z.enum(['dev-server','watcher','task','agent','script']).optional(),
});

type Input = z.infer<typeof Schema>;

export class StartProcessTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'start_process';
  description = 'Start a managed process inside a registered repository.';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'POST', '/api/processes', input);
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}