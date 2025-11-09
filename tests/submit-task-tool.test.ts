import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SubmitTaskTool } from '../src/tools/task/SubmitTaskTool';

const BASE_CONFIG = {
  name: 'test-mcp',
  version: '0.0.0',
  bridgeHost: 'localhost',
  bridgePort: 65535,
  bridgePath: '',
};

describe('SubmitTaskTool', () => {
  let tmpDir: string;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-submit-task-'));
    fs.mkdirSync(path.join(tmpDir, '.git'));
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Online submission (ADE bridge available)', () => {
    test('submits task to /tasks/submit endpoint when ADE is available', async () => {
      let capturedUrl = '';
      let capturedBody = '';

      global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url.toString();
        capturedBody = init?.body as string;

        return new Response(
          JSON.stringify({
            success: true,
            taskId: 'ade-task-123',
            repository: tmpDir,
            message: 'Task submitted successfully',
          }),
          { status: 200 },
        );
      };

      const tool = new SubmitTaskTool(BASE_CONFIG);
      const result = await tool.handler({
        dependencyId: 'library-a',
        repositoryRoot: tmpDir,
        taskSummary: 'Implement feature',
        taskDetails: 'Create the new feature for dependency.',
        tags: ['feature'],
        priority: 'high',
      });

      expect(result.isError).toBeUndefined();
      const payload = result.content[0]?.data as any;
      expect(payload?.success).toBe(true);
      expect(payload?.taskId).toBe('ade-task-123');
      expect(payload?.persistedOffline).toBe(false);

      // Verify it called the correct endpoint
      expect(capturedUrl).toContain('/tasks/submit');
      expect(capturedUrl).not.toContain('/dependencies/submit');

      // Verify request body
      const requestBody = JSON.parse(capturedBody);
      expect(requestBody.dependencyId).toBe('library-a');
      expect(requestBody.taskSummary).toBe('Implement feature');
    });

    test('uses custom bridge path when configured', async () => {
      let capturedUrl = '';

      global.fetch = async (url: string | URL | Request) => {
        capturedUrl = url.toString();
        return new Response(
          JSON.stringify({
            success: true,
            taskId: 'ade-task-456',
          }),
          { status: 200 },
        );
      };

      const tool = new SubmitTaskTool({
        ...BASE_CONFIG,
        bridgePath: '/api/v1',
      });

      await tool.handler({
        dependencyId: 'library-b',
        repositoryRoot: tmpDir,
        taskSummary: 'Fix bug',
        taskDetails: 'Fix critical bug.',
      });

      expect(capturedUrl).toBe('http://localhost:65535/api/v1/tasks/submit');
    });
  });

  describe('Offline fallback (ADE bridge unavailable)', () => {
    test('falls back to default pending queue when ADE unavailable', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool(BASE_CONFIG);
      const result = await tool.handler({
        dependencyId: 'library-a',
        repositoryRoot: tmpDir,
        taskSummary: 'Implement feature',
        taskDetails: 'Create the new feature for dependency.',
        tags: ['feature'],
        priority: 'high',
      });

      expect(result.isError).toBeUndefined();
      const payload = result.content[0]?.data as any;
      expect(payload?.success).toBe(true);
      expect(payload?.taskId).toBeTruthy();
      expect(payload?.persistedOffline).toBe(true);

      // Verify file was created in default location
      const defaultQueuePath = path.join(tmpDir, '.mcp-pending');
      expect(fs.existsSync(defaultQueuePath)).toBe(true);

      const files = fs.readdirSync(defaultQueuePath);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^task-[a-f0-9-]+\.json$/);

      // Verify JSON file contents
      const taskFile = path.join(defaultQueuePath, files[0]);
      const taskData = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));
      expect(taskData.taskId).toBe(payload.taskId);
      expect(taskData.dependencyId).toBe('library-a');
      expect(taskData.taskSummary).toBe('Implement feature');
      expect(taskData.taskDetails).toBe('Create the new feature for dependency.');
      expect(taskData.priority).toBe('high');
      expect(taskData.tags).toEqual(['feature']);
      expect(taskData.timestamp).toBeTruthy();
      expect(taskData.repositoryRoot).toBe(tmpDir);
    });

    test('uses custom pending queue path when configured', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const customQueuePath = path.join(tmpDir, 'custom-queue');

      const tool = new SubmitTaskTool({
        ...BASE_CONFIG,
        pendingQueuePath: customQueuePath,
      });

      const result = await tool.handler({
        dependencyId: 'library-b',
        repositoryRoot: tmpDir,
        taskSummary: 'Fix bug',
        taskDetails: 'Fix critical bug.',
      });

      expect(result.isError).toBeUndefined();
      const payload = result.content[0]?.data as any;
      expect(payload?.persistedOffline).toBe(true);

      // Verify file was created in custom location
      expect(fs.existsSync(customQueuePath)).toBe(true);
      const files = fs.readdirSync(customQueuePath);
      expect(files.length).toBe(1);
    });

    test('expands home directory in pending queue path', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const homeDir = os.homedir();
      const queueSubdir = `mcp-test-${Date.now()}`;
      const expandedPath = path.join(homeDir, queueSubdir);

      try {
        const tool = new SubmitTaskTool({
          ...BASE_CONFIG,
          pendingQueuePath: `~/${queueSubdir}`,
        });

        const result = await tool.handler({
          dependencyId: 'library-c',
          repositoryRoot: tmpDir,
          taskSummary: 'Add feature',
          taskDetails: 'Add new feature.',
        });

        expect(result.isError).toBeUndefined();

        // Verify directory was created in home directory
        expect(fs.existsSync(expandedPath)).toBe(true);
        const files = fs.readdirSync(expandedPath);
        expect(files.length).toBe(1);
      } finally {
        // Cleanup
        if (fs.existsSync(expandedPath)) {
          fs.rmSync(expandedPath, { recursive: true, force: true });
        }
      }
    });

    test('creates pending queue directory if it does not exist', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const newQueuePath = path.join(tmpDir, 'deeply', 'nested', 'queue');
      expect(fs.existsSync(newQueuePath)).toBe(false);

      const tool = new SubmitTaskTool({
        ...BASE_CONFIG,
        pendingQueuePath: newQueuePath,
      });

      const result = await tool.handler({
        dependencyId: 'library-d',
        repositoryRoot: tmpDir,
        taskSummary: 'Task',
        taskDetails: 'Details.',
      });

      expect(result.isError).toBeUndefined();
      expect(fs.existsSync(newQueuePath)).toBe(true);
    });

    test('rejects relative paths in pendingQueuePath configuration', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool({
        ...BASE_CONFIG,
        pendingQueuePath: './relative/path',
      });

      const result = await tool.handler({
        dependencyId: 'library-e',
        repositoryRoot: tmpDir,
        taskSummary: 'Task',
        taskDetails: 'Details.',
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text;
      expect(errorText).toContain('must be absolute');
    });

    test('requires repositoryRoot when ADE unavailable', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool(BASE_CONFIG);
      const result = await tool.handler({
        dependencyId: 'library-f',
        // repositoryRoot is missing
        taskSummary: 'Task',
        taskDetails: 'Details.',
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text;
      expect(errorText).toContain('repositoryRoot is required');
    });

    test('includes all optional fields in persisted task', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool(BASE_CONFIG);
      const result = await tool.handler({
        dependencyId: 'library-g',
        repositoryRoot: tmpDir,
        taskSummary: 'Comprehensive task',
        taskDetails: 'Detailed description of the task.',
        priority: 'critical',
        tags: ['urgent', 'security'],
        anchors: ['src/auth.ts', 'src/login.ts'],
      });

      expect(result.isError).toBeUndefined();

      const queuePath = path.join(tmpDir, '.mcp-pending');
      const files = fs.readdirSync(queuePath);
      const taskFile = path.join(queuePath, files[0]);
      const taskData = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));

      expect(taskData.priority).toBe('critical');
      expect(taskData.tags).toEqual(['urgent', 'security']);
      expect(taskData.anchors).toEqual(['src/auth.ts', 'src/login.ts']);
    });

    test('defaults priority to normal when not specified', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool(BASE_CONFIG);
      await tool.handler({
        dependencyId: 'library-h',
        repositoryRoot: tmpDir,
        taskSummary: 'Task without priority',
        taskDetails: 'Details.',
      });

      const queuePath = path.join(tmpDir, '.mcp-pending');
      const files = fs.readdirSync(queuePath);
      const taskFile = path.join(queuePath, files[0]);
      const taskData = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));

      expect(taskData.priority).toBe('normal');
    });
  });

  describe('Validation', () => {
    test('rejects empty dependencyId', async () => {
      const tool = new SubmitTaskTool(BASE_CONFIG);
      const result = await tool.handler({
        dependencyId: '',
        repositoryRoot: tmpDir,
        taskSummary: 'Task',
        taskDetails: 'Details.',
      });

      expect(result.isError).toBe(true);
    });

    test('rejects empty taskSummary', async () => {
      const tool = new SubmitTaskTool(BASE_CONFIG);
      const result = await tool.handler({
        dependencyId: 'library-i',
        repositoryRoot: tmpDir,
        taskSummary: '',
        taskDetails: 'Details.',
      });

      expect(result.isError).toBe(true);
    });

    test('rejects empty taskDetails', async () => {
      const tool = new SubmitTaskTool(BASE_CONFIG);
      const result = await tool.handler({
        dependencyId: 'library-j',
        repositoryRoot: tmpDir,
        taskSummary: 'Task',
        taskDetails: '',
      });

      expect(result.isError).toBe(true);
    });

    test('accepts valid priority values', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool(BASE_CONFIG);
      const priorities: Array<'low' | 'normal' | 'high' | 'critical'> = [
        'low',
        'normal',
        'high',
        'critical',
      ];

      for (const priority of priorities) {
        const result = await tool.handler({
          dependencyId: 'library-k',
          repositoryRoot: tmpDir,
          taskSummary: `Task with ${priority} priority`,
          taskDetails: 'Details.',
          priority,
        });

        expect(result.isError).toBeUndefined();
      }
    });
  });

  describe('JSON file format', () => {
    test('generates unique UUID for each task', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool(BASE_CONFIG);

      // Create two tasks
      const result1 = await tool.handler({
        dependencyId: 'library-l',
        repositoryRoot: tmpDir,
        taskSummary: 'Task 1',
        taskDetails: 'First task.',
      });

      const result2 = await tool.handler({
        dependencyId: 'library-m',
        repositoryRoot: tmpDir,
        taskSummary: 'Task 2',
        taskDetails: 'Second task.',
      });

      const payload1 = result1.content[0]?.data as any;
      const payload2 = result2.content[0]?.data as any;

      expect(payload1.taskId).not.toBe(payload2.taskId);

      // Verify both files exist with different names
      const queuePath = path.join(tmpDir, '.mcp-pending');
      const files = fs.readdirSync(queuePath);
      expect(files.length).toBe(2);
    });

    test('file name matches task-{uuid}.json pattern', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool(BASE_CONFIG);
      const result = await tool.handler({
        dependencyId: 'library-n',
        repositoryRoot: tmpDir,
        taskSummary: 'Task',
        taskDetails: 'Details.',
      });

      const payload = result.content[0]?.data as any;
      const queuePath = path.join(tmpDir, '.mcp-pending');
      const expectedFile = path.join(queuePath, `task-${payload.taskId}.json`);

      expect(fs.existsSync(expectedFile)).toBe(true);
    });

    test('JSON file has valid structure with all required fields', async () => {
      global.fetch = () => Promise.reject(new Error('connection refused'));

      const tool = new SubmitTaskTool(BASE_CONFIG);
      await tool.handler({
        dependencyId: 'library-o',
        repositoryRoot: tmpDir,
        taskSummary: 'Test task',
        taskDetails: 'Test details.',
        priority: 'high',
        tags: ['test'],
        anchors: ['src/test.ts'],
      });

      const queuePath = path.join(tmpDir, '.mcp-pending');
      const files = fs.readdirSync(queuePath);
      const taskFile = path.join(queuePath, files[0]);
      const taskData = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));

      // Verify all required fields exist
      expect(taskData).toHaveProperty('taskId');
      expect(taskData).toHaveProperty('timestamp');
      expect(taskData).toHaveProperty('repositoryRoot');
      expect(taskData).toHaveProperty('dependencyId');
      expect(taskData).toHaveProperty('taskSummary');
      expect(taskData).toHaveProperty('taskDetails');
      expect(taskData).toHaveProperty('priority');
      expect(taskData).toHaveProperty('tags');
      expect(taskData).toHaveProperty('anchors');

      // Verify timestamp is valid ISO 8601
      expect(() => new Date(taskData.timestamp)).not.toThrow();
      expect(new Date(taskData.timestamp).toISOString()).toBe(taskData.timestamp);
    });
  });
});
