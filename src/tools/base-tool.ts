import { z } from 'zod';

import { McpTool, McpToolResult, JsonSchema, McpServerConfig } from '../types';
import { zodToJsonSchema } from '../utils/zod-to-json-schema';

export abstract class BaseTool<TParams = unknown, TResult = unknown>
  implements McpTool<TParams, TResult>
{
  protected readonly config: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  abstract name: string;
  abstract description: string;
  abstract schema: z.ZodSchema<TParams>;

  get inputSchema(): JsonSchema {
    return zodToJsonSchema(this.schema);
  }

  abstract execute(params: TParams): Promise<McpToolResult<TResult>>;

  async handler(params: TParams): Promise<McpToolResult<TResult>> {
    try {
      const validatedParams = this.schema.parse(params);
      return await this.execute(validatedParams);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text',
              text: `Validation error: ${error.issues.map((e) => `${e.path.map(String).join('.')}: ${e.message}`).join(', ')}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  protected createSuccessResponse(text: string, data?: TResult): McpToolResult<TResult> {
    return {
      content: [
        {
          type: 'text',
          text,
          data,
        },
      ],
    };
  }

  protected createErrorResponse(message: string): McpToolResult<TResult> {
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };
  }

  protected resolvePath(relativePath: string): string {
    const basePath = this.config.bridgePath ?? '';
    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const normalizedRelative = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    const combined = `${normalizedBase}${normalizedRelative}`;
    return combined.length > 0 ? combined : normalizedRelative;
  }
}
