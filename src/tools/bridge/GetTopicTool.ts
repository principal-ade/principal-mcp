import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  id: z.string().min(1).describe('Local topic id.'),
});

type Input = z.infer<typeof Schema>;

export class GetTopicTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'get_topic';
  description = 'Read a local topic, including its full Markdown description and revision.';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'GET', `/api/topics/${encodeURIComponent(input.id)}`);
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}