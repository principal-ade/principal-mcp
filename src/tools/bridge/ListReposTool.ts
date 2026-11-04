import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';
import { bridgeRequest } from '../../utils/bridge';

const Schema = z.object({});

export class ListReposTool extends BaseTool<{}, unknown> {
  constructor(config: McpServerConfig) { super(config); }
  name = 'list_repos';
  description = 'List registered local repositories (path, name, purl).';
  schema = Schema;

  async execute(): Promise<McpToolResult<unknown>> {
    const result = await bridgeRequest(this.config, 'GET', '/api/repos');
    const text = JSON.stringify(result.data, null, 2);
    if (!result.ok) return this.createErrorResponse(`Bridge ${result.status}: ${text}`);
    return this.createSuccessResponse(text, result.data);
  }
}