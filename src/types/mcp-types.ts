import { z } from 'zod';

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: Array<string | number | boolean | null>;
  oneOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  description?: string;
  default?: unknown;
  [key: string]: unknown;
};

export type RequestData = Record<string, unknown>;
export type ResponseData = unknown;

export type ToolParams = unknown;
export type ToolResult = unknown;

export type AnyMcpTool = McpTool<ToolParams, ToolResult>;

export interface McpTool<TParams = unknown, TResult = unknown> {
  name: string;
  description?: string;
  schema: z.ZodSchema<TParams>;
  inputSchema?: JsonSchema;
  handler: (params: TParams) => Promise<McpToolResult<TResult>>;
}

export interface McpToolResult<T = unknown> {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: T;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<string | Buffer>;
}

export interface McpServerConfig {
  name: string;
  version: string;
  bridgePort: number;
  bridgeHost?: string;
  bridgePath?: string;
  pendingQueuePath?: string;      // Configurable pending task queue location for submit_task tool
  enabledTools?: string[];        // List of tool names to enable (undefined = all tools)
}

export interface HttpBridgeRequest {
  type: string;
  [key: string]: unknown;
}

export interface HttpBridgeResponse {
  success: boolean;
  data?: ResponseData;
  error?: string;
  message?: string;
}
