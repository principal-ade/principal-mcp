import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  repositoryPath: z.string().optional(),
  relativeFilePath: z.string().min(1),
  body: z.string().min(1).describe('Markdown note body.'),
  anchor: z.object({ exact: z.string().min(1), prefix: z.string().optional(), suffix: z.string().optional() }),
  author: z.string().optional().describe('Agent name for attribution.'),
});

type Input = z.infer<typeof Schema>;

export class CreateDocumentNoteTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'create_document_note';
  description = 'Create a text-anchored note overlay on a document (does not edit source).';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'POST', '/api/document-notes', input);
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}