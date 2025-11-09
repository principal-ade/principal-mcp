#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { BRANDING } from './constants/branding';

import { McpServer } from './server';
import { McpServerConfig } from './types';

export { McpServer } from './server';
export { BaseTool } from './tools';
export { type McpTool, type McpToolResult, type McpResource, type McpServerConfig } from './types';

if (require.main === module) {
  // Parse command-line arguments
  const { values: cliArgs } = parseArgs({
    options: {
      'pending-queue-path': { type: 'string' },
      tools: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
    },
    strict: false,
  });

  // Priority: CLI flags > env vars > defaults
  const port = parseInt(
    (cliArgs.port as string) || process.env.PRINCIPLE_MCP_PORT || process.env.PORT || '3044',
  );

  const pendingQueuePath =
    (cliArgs['pending-queue-path'] as string) || process.env.PRINCIPLE_MCP_PENDING_QUEUE_PATH;

  const enabledToolsStr = (cliArgs.tools as string) || process.env.PRINCIPLE_MCP_ENABLED_TOOLS;

  const enabledTools =
    enabledToolsStr && enabledToolsStr !== '*'
      ? enabledToolsStr.split(',').map(t => t.trim())
      : undefined; // undefined means "all tools"

  const config: McpServerConfig = {
    name: BRANDING.MCP_SERVER_NAME,
    version: BRANDING.MCP_VERSION,
    bridgePort: port,
    bridgeHost: (cliArgs.host as string) || process.env.PRINCIPLE_MCP_HOST || 'localhost',
    bridgePath: process.env.PRINCIPLE_MCP_PATH || '',
    pendingQueuePath: pendingQueuePath,
    enabledTools: enabledTools,
  };

  const server = new McpServer(config);

  process.on('SIGINT', async () => {
    console.error('\nShutting down MCP server...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('\nShutting down MCP server...');
    await server.stop();
    process.exit(0);
  });

  server.start().catch(error => {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  });
}
