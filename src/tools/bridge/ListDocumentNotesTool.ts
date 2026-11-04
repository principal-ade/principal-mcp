import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({
  repositoryPath: z.string().optional().describe('Absolute repository path; omit for repo-agnostic.'),
  relativeFilePath: z.string().min(1).describe('Relative file path within the repository.'),
});

type Input = z.infer<typeof Schema>;

export class ListDocumentNotesTool extends BaseTool<Input, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'list_document_notes';
  description = 'List text-anchored notes for a document.';
  schema = Schema;

  async execute(input: Input): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'GET', '/api/document-notes', undefined, { repositoryPath: input.repositoryPath, relativeFilePath: input.relativeFilePath });
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}