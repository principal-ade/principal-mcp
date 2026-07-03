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
  SubmitUpstreamTaskTool,
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
      {
        name: 'submit_upstream_task',
        factory: () => new SubmitUpstreamTaskTool(this.config) as AnyMcpTool,
      },
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
      // One resource per local clone, fetched live from the bridge so they
      // show up in the client's `@` menu (fuzzy-matched on `name`) alongside
      // files. Read returns just the clone's absolute path.
      for (const clone of await this.fetchClones()) {
        resourceList.push({
          uri: clone.uri,
          name: clone.name,
          description: clone.path,
          mimeType: 'text/plain',
        });
      }
      return { resources: resourceList };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;

      // Clone resources aren't in the static map — resolve them against the
      // live bridge list and return the clone's path.
      if (uri.startsWith('clone://')) {
        const clone = (await this.fetchClones()).find(c => c.uri === uri);
        if (!clone) {
          throw new Error(`Unknown clone: ${uri}`);
        }
        return {
          contents: [{ uri, mimeType: 'text/plain', text: clone.path }],
        };
      }

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

  /**
   * Fetch the registered local clones from the bridge (`GET /api/repos`) and
   * shape them into resource descriptors. Each clone's `uri` is keyed on its
   * absolute path, which is the only unique key: the same repo can be cloned
   * at two paths (same purl, same remote), so keying on purl/remote would
   * collide and a read could return the wrong clone. `name` is the repo
   * basename, which is what the client's `@` menu fuzzy-matches against;
   * `description` carries the full path so same-named clones stay tellable
   * apart. Returns [] when the bridge is unreachable, so the `@` menu simply
   * shows files and no clones.
   */
  private async fetchClones(): Promise<Array<{ uri: string; name: string; path: string }>> {
    const host = this.config.bridgeHost ?? 'localhost';
    const port = this.config.bridgePort ?? 3044;
    const protocol = process.env.PRINCIPLE_MCP_PROTOCOL ?? 'http';
    const url = `${protocol}://${host}:${port}/api/repos`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }
      const body = (await response.json()) as {
        repos?: Array<{ path?: string; remoteUrl?: string; purl?: string }>;
      };
      const repos = Array.isArray(body.repos) ? body.repos : [];
      return repos
        .filter((r): r is { path: string; remoteUrl?: string; purl?: string } =>
          typeof r.path === 'string' && r.path.length > 0,
        )
        .map(r => {
          const name = r.path.split('/').filter(Boolean).pop() ?? r.path;
          return { uri: `clone://${r.path}`, name, path: r.path };
        });
    } catch {
      return [];
    }
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
