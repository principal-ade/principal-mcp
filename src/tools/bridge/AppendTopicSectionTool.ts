import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  id: z.string().min(1).describe('Local topic id.'),
  heading: z.string().min(1).describe('Section heading (leading # optional).'),
  body: z.string().min(1).describe('Replacement section body.'),
  level: z.number().int().min(2).max(3).optional().describe('Heading level (2 or 3), default 2.'),
});

type Input = z.infer<typeof Schema>;

export class AppendTopicSectionTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'upsert_topic_section';
  description = 'Replace or insert a Markdown section in a local topic.';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const { id, ...body } = input;
    const result = await bridgeRequest(this.config, 'POST', `/api/topics/${encodeURIComponent(id)}/description/section`, body);
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}