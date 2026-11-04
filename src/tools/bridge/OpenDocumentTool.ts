import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  filePath: z.string().min(1).describe('Absolute path, or relative when repositoryPath is supplied.'),
  repositoryPath: z.string().optional(),
  createIfMissing: z.boolean().optional(),
});

type Input = z.infer<typeof Schema>;

export class OpenDocumentTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'open_document';
  description = 'Open a document tab in the Principal app (optionally creating the file).';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'POST', '/api/document/open', input);
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}