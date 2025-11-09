import { MemoryPalace, NodeFileSystemAdapter } from '@a24z/core-library';
import { z } from 'zod';

import type { ValidatedRepositoryPath } from '@a24z/core-library';
import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';

interface AddMemoryNoteResult {
  success: boolean;
  noteId: string;
  repository: string;
  relativePath: string;
  anchors: string[];
  tags: string[];
}

const AddMemoryNoteSchema = z.object({
  repositoryRoot: z.string().min(1, 'repositoryRoot is required'),
  workingDirectory: z.string().min(1).optional(),
  note: z.string().min(1, 'note content is required'),
  anchors: z
    .array(z.string().min(1, 'anchor value cannot be empty'))
    .min(1, 'at least one anchor is required'),
  tags: z.array(z.string().min(1, 'tag value cannot be empty')).optional(),
  metadata: z.record(z.unknown()).optional(),
  codebaseViewId: z.string().min(1).optional(),
});

type AddMemoryNoteInput = z.infer<typeof AddMemoryNoteSchema>;

export class AddMemoryNoteTool extends BaseTool<AddMemoryNoteInput, AddMemoryNoteResult> {
  constructor(config: McpServerConfig) {
    super(config);
  }

  name = 'add_memory_note';
  description = 'Create a new anchored note in the repository memory palace.';
  schema = AddMemoryNoteSchema;

  async execute(input: AddMemoryNoteInput): Promise<McpToolResult<AddMemoryNoteResult>> {
    try {
      const fsAdapter = new NodeFileSystemAdapter();
      const validatedRoot = MemoryPalace.validateRepositoryPath(
        fsAdapter,
        input.repositoryRoot,
      ) as ValidatedRepositoryPath;

      const baseDirectory = this.resolveWorkingDirectory(
        fsAdapter,
        validatedRoot,
        input.workingDirectory,
      );

      const relativeAnchors = this.normalizeAnchors(
        fsAdapter,
        validatedRoot,
        baseDirectory,
        input.anchors,
      );

      const palace = new MemoryPalace(validatedRoot, fsAdapter);
      const saved = palace.saveNote({
        note: input.note,
        tags: input.tags ?? [],
        anchors: relativeAnchors,
        metadata: input.metadata ?? {},
        codebaseViewId: input.codebaseViewId,
      });

      return this.createSuccessResponse('Memory Palace note saved successfully.', {
        success: true,
        noteId: saved.note.id,
        repository: validatedRoot,
        relativePath: saved.path,
        anchors: saved.note.anchors,
        tags: saved.note.tags,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save Memory Palace note.';
      return this.createErrorResponse(message);
    }
  }

  private resolveWorkingDirectory(
    fsAdapter: NodeFileSystemAdapter,
    repositoryRoot: ValidatedRepositoryPath,
    workingDirectory?: string,
  ): string {
    if (!workingDirectory) {
      return repositoryRoot;
    }

    const absoluteDir = fsAdapter.isAbsolute(workingDirectory)
      ? workingDirectory
      : fsAdapter.join(repositoryRoot, workingDirectory);

    // Ensure the working directory is inside the repository
    MemoryPalace.validateRelativePath(repositoryRoot, absoluteDir, fsAdapter);
    return absoluteDir;
  }

  private normalizeAnchors(
    fsAdapter: NodeFileSystemAdapter,
    repositoryRoot: ValidatedRepositoryPath,
    workingDirectory: string,
    anchors: string[],
  ): string[] {
    return anchors.map(anchor => {
      const absoluteAnchor = fsAdapter.isAbsolute(anchor)
        ? anchor
        : fsAdapter.join(workingDirectory, anchor);

      return MemoryPalace.validateRelativePath(
        repositoryRoot,
        absoluteAnchor,
        fsAdapter,
      ) as unknown as string;
    });
  }
}
