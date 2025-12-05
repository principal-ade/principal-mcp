import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { MemoryPalace } from '@principal-ai/alexandria-core-library';
import { NodeFileSystemAdapter } from '@principal-ai/alexandria-core-library/node';

import { AddMemoryNoteTool } from '../src/tools/memory/AddMemoryNoteTool';

const MCP_CONFIG = {
  name: 'test-mcp',
  version: '0.0.0',
};

describe('AddMemoryNoteTool', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-memory-note-'));
    fs.mkdirSync(path.join(tmpDir, '.git'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates a note relative to the working directory', async () => {
    const workingDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(workingDir, { recursive: true });
    const anchorFile = path.join(workingDir, 'Button.tsx');
    fs.writeFileSync(anchorFile, '// component');

    const tool = new AddMemoryNoteTool(MCP_CONFIG);
    const result = await tool.handler({
      repositoryRoot: tmpDir,
      workingDirectory: workingDir,
      note: 'Document the button component',
      anchors: ['Button.tsx'],
      tags: ['ui', 'docs'],
    });

    expect(result.isError).toBeUndefined();
    const payload = result.content[0]?.data as any;
    expect(payload?.success).toBe(true);
    expect(payload?.noteId).toBeTruthy();
    expect(payload?.anchors).toEqual(['src/components/Button.tsx']);

    const notePath = path.join(tmpDir, payload.relativePath);
    expect(fs.existsSync(notePath)).toBe(true);

    const palace = new MemoryPalace(
      tmpDir,
      new NodeFileSystemAdapter(),
    );
    const notes = palace.getNotes();
    const savedNote = notes.find(n => n.note.id === payload.noteId);
    expect(savedNote).toBeDefined();
    expect(savedNote?.note.note).toContain('Document the button component');
  });
});
