import * as http from 'http';

import { z } from 'zod';

import { BRANDING } from '../constants/branding';
import { McpToolResult, McpServerConfig } from '../types';

import { BaseTool } from './base-tool';

export class UserPromptTool extends BaseTool {
  constructor(config: McpServerConfig) {
    super(config);
  }

  name = 'user_prompt';
  description = 'Request input from the user through a dialog prompt';

  schema = z.object({
    filePath: z.string().describe('The path to the file or directory relevant to the prompt'),
    message: z.string().describe('The message to show to the user'),
    title: z.string().optional().default('MCP Prompt').describe('The title of the prompt dialog'),
    type: z
      .enum(['text', 'confirm', 'select', 'multiline'])
      .optional()
      .default('text')
      .describe('The type of prompt'),
    options: z.array(z.string()).optional().describe('Options for select type prompts'),
    defaultValue: z
      .union([z.string(), z.boolean()])
      .optional()
      .describe('Default value for the prompt'),
    placeholder: z.string().optional().describe('Placeholder text for input fields'),
    required: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether the user must provide a value'),
    timeout: z.number().optional().describe('Timeout in milliseconds (optional)'),
  });

  async execute(input: z.infer<typeof this.schema>): Promise<McpToolResult> {
    return new Promise(resolve => {
      const bridgeHost = this.config.bridgeHost ?? 'localhost';
      const bridgePort = this.config.bridgePort ?? BRANDING.DEFAULT_BRIDGE_PORT;
      const requestPath = this.resolvePath('/mcp-prompt');

      const promptId = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const requestData = {
        id: promptId,
        filePath: input.filePath,
        title: input.title || 'MCP Prompt',
        message: input.message,
        type: input.type || 'text',
        options: input.options,
        defaultValue: input.defaultValue,
        placeholder: input.placeholder,
        required: input.required || false,
        timeout: input.timeout,
      };

      const postData = JSON.stringify(requestData);

      const options: http.RequestOptions = {
        hostname: bridgeHost,
        port: bridgePort,
        path: requestPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: input.timeout || 60000,
      };

      const req = http.request(options, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);

            if (response.success) {
              resolve({
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: true,
                        value: response.value,
                        promptId: response.id,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              });
            } else {
              const errorMessage = response.cancelled
                ? 'User cancelled the prompt'
                : response.error || 'Failed to get user response';

              resolve({
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: false,
                        error: errorMessage,
                        cancelled: response.cancelled || false,
                        promptId: response.id,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: !response.cancelled,
              });
            }
          } catch (error) {
            resolve({
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      error: `Invalid response from MCP Bridge: ${data}: ${error}`,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            });
          }
        });
      });

      req.on('error', (error: Error) => {
        console.error('[UserPromptTool] Error:', error);

        const errorMessage = error.message.includes('ECONNREFUSED')
          ? BRANDING.MCP_BRIDGE_ERROR
          : error.message;

        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: errorMessage,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: 'Request timed out',
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        });
      });

      req.write(postData);
      req.end();
    });
  }
}
