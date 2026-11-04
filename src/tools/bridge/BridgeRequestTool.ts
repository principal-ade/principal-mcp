import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'DELETE', 'PUT']).describe('HTTP method'),
  path: z.string().min(1).describe('Bridge route path, e.g. /api/topics or /api/topics/:id'),
  body: z.any().optional().describe('JSON request body for POST/PATCH/PUT'),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('Query parameters'),
});

type Input = z.infer<typeof Schema>;

export class BridgeRequestTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) {
    super(config);
  }

  name = 'bridge_request';
  description =
    'Make an arbitrary request to the Principal ADE bridge (localhost). Use this to access any bridge route not covered by a dedicated tool. Paths must match registered route patterns (see GET /routes).';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    try {
      const result = await bridgeRequest(this.config, input.method, input.path, input.body, input.query);
      const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
      if (!result.ok) {
        return this.createErrorResponse(`Bridge responded with status ${result.status}: ${text}`);
      }
      return this.createSuccessResponse(text, result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.createErrorResponse(`Failed to call bridge: ${message}. Ensure the Principal app is running.`);
    }
  }
}