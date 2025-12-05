import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { MemoryPalace } from '@principal-ai/alexandria-core-library';
import { NodeFileSystemAdapter } from '@principal-ai/alexandria-core-library/node';

import type { ValidatedRelativePath } from '@principal-ai/alexandria-core-library';

import { SubmitDependencyTaskTool } from '../src/tools/dependency/SubmitDependencyTaskTool';
import { GetDependencyTaskDocTool } from '../src/tools/dependency/GetDependencyTaskDocTool';

const MCP_CONFIG = {
  name: 'test-mcp',
  version: '0.0.0',
  bridgeHost: 'localhost',
  bridgePort: 65535,
  bridgePath: '',
};

describe('Dependency MCP tools', () => {
  let tmpDir: string;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-dependency-'));
    fs.mkdirSync(path.join(tmpDir, '.git'));
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('SubmitDependencyTaskTool falls back to Memory Palace when ADE unavailable', async () => {
    global.fetch = () => Promise.reject(new Error('connection refused'));

    const anchorPath = path.join(tmpDir, 'src', 'index.ts');
    fs.mkdirSync(path.dirname(anchorPath), { recursive: true });
    fs.writeFileSync(anchorPath, '// test');

    const tool = new SubmitDependencyTaskTool(MCP_CONFIG);
    const result = await tool.handler({
      dependencyId: 'library-a',
      repositoryRoot: tmpDir,
      taskSummary: 'Implement feature',
      taskDetails: 'Create the new feature for dependency.',
      anchors: [anchorPath],
      tags: ['feature'],
      priority: 'high',
    });

    expect(result.isError).toBeUndefined();
    const payload = result.content[0]?.data as any;
    expect(payload?.taskId).toBeTruthy();
    expect(payload?.persistedOffline).toBe(true);

    const expectedDoc = path.join(
      tmpDir,
      '.palace-work',
      'tasks',
      'active',
      `${payload.taskId}.task.md`,
    );
    expect(fs.existsSync(expectedDoc)).toBe(true);
  });

  test('GetDependencyTaskDocTool returns document path for existing task', async () => {
    const fsAdapter = new NodeFileSystemAdapter();
    const palace = new MemoryPalace(tmpDir, fsAdapter);

    const task = palace.receiveTask(
      {
        content: '# Sample Task\n\nDetails',
        directoryPath: '' as ValidatedRelativePath,
      },
      'test-sender',
    );

    const tool = new GetDependencyTaskDocTool(MCP_CONFIG);
    const result = await tool.handler({
      taskId: task.id,
      repositoryRoot: tmpDir,
    });

    expect(result.isError).toBeUndefined();
    const payload = result.content[0]?.data as any;
    expect(payload?.documentPath).toBe(
      path.join(tmpDir, '.palace-work', 'tasks', 'active', `${task.id}.task.md`),
    );
  });
});
