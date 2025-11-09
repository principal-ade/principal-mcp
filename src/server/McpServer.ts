import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  SubmitDependencyTaskTool,
  SubmitTaskTool,
  GetDependencyTaskDocTool,
  AddMemoryNoteTool,
  ResolveProjectTool,
} from '../tools';
import { McpServerConfig, McpTool, McpResource, AnyMcpTool } from '../types';

type QueueMessage = unknown;

export class McpServer {
  private server: Server;
  private config: McpServerConfig;
  private tools: Map<string, AnyMcpTool> = new Map();
  private resources: Map<string, McpResource> = new Map();
  private messageQueue: QueueMessage[] = [];

  constructor(config: McpServerConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    this.setupDefaultTools();
    this.setupDefaultResources();
    this.registerHandlers();
  }

  private setupDefaultTools() {
    const tools: Array<{ name: string; factory: () => AnyMcpTool }> = [
      {
        name: 'submit_dependency_task',
        factory: () => new SubmitDependencyTaskTool(this.config) as AnyMcpTool,
      },
      { name: 'submit_task', factory: () => new SubmitTaskTool(this.config) as AnyMcpTool },
      {
        name: 'get_dependency_task_doc',
        factory: () => new GetDependencyTaskDocTool(this.config) as AnyMcpTool,
      },
      { name: 'add_memory_note', factory: () => new AddMemoryNoteTool(this.config) as AnyMcpTool },
      {
        name: 'resolve_project',
        factory: () => new ResolveProjectTool(this.config) as AnyMcpTool,
      },
    ];

    for (const tool of tools) {
      // If enabledTools is undefined, enable all tools
      // Otherwise, only enable tools in the list
      if (!this.config.enabledTools || this.config.enabledTools.includes(tool.name)) {
        this.addTool(tool.factory());
      }
    }
  }

  private setupDefaultResources() {
    this.addResource({
      uri: 'app://status',
      name: 'Application Status',
      description: 'Current application status and metrics',
      mimeType: 'application/json',
      handler: async () => {
        const status = {
          status: 'running',
          messageQueue: this.messageQueue.length,
          timestamp: Date.now(),
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        };
        return JSON.stringify(status, null, 2);
      },
    });
  }

  private registerHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const toolList = [];
      for (const [, tool] of this.tools.entries()) {
        toolList.push({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {},
        });
      }
      return { tools: toolList };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      const tool = this.tools.get(name);

      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const result = await tool.handler(args || {});
      return {
        content: result.content,
      };
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resourceList = [];
      for (const [, resource] of this.resources.entries()) {
        resourceList.push({
          uri: resource.uri,
          name: resource.name,
          description: resource.description || '',
          mimeType: resource.mimeType || 'text/plain',
        });
      }
      return { resources: resourceList };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;
      const resource = this.resources.get(uri);

      if (!resource) {
        throw new Error(`Unknown resource: ${uri}`);
      }

      const content = await resource.handler();
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType || 'text/plain',
            text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
          },
        ],
      };
    });
  }

  addTool<TParams, TResult>(tool: McpTool<TParams, TResult>) {
    this.tools.set(tool.name, tool as AnyMcpTool);
  }

  addResource(resource: McpResource) {
    this.resources.set(resource.uri, resource);
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`✅ ${this.config.name} MCP server started successfully`);
  }

  async stop() {
    console.error(`${this.config.name} MCP server stopped`);
  }
}
