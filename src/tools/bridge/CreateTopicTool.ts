import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  title: z.string().min(1).describe('Non-empty topic title.'),
  description: z.string().optional().describe('Markdown brief.'),
  repos: z.array(z.string()).optional().describe('Repository PURLs.'),
  subsystemModels: z.array(z.object({ modelId: z.string(), trailIds: z.array(z.string()).optional() })).optional(),
  references: z.array(z.object({ kind: z.enum(['c4-sketch','drawing','topic']), sketchId: z.string().optional(), drawingId: z.string().optional(), topicId: z.string().optional() })).optional(),
});

type Input = z.infer<typeof Schema>;

export class CreateTopicTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'create_topic';
  description = 'Create a local Markdown topic brief with optional repo/model/reference attachments.';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'POST', '/api/topics', input);
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}