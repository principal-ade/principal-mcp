import { MemoryPalace } from '@principal-ai/alexandria-core-library';
import { NodeFileSystemAdapter } from '@principal-ai/alexandria-core-library/node';
import { z } from 'zod';

import type { McpServerConfig, McpToolResult } from '../../types';
import { BaseTool } from '../base-tool';

interface GetDependencyTaskDocResult {
  success: boolean;
  taskId: string;
  repository: string;
  documentPath: string;
  status: string;
}

const GetDependencyTaskDocSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  repositoryRoot: z.string().min(1, 'repositoryRoot is required'),
});

type GetDependencyTaskDocInput = z.infer<typeof GetDependencyTaskDocSchema>;

export class GetDependencyTaskDocTool extends BaseTool<
  GetDependencyTaskDocInput,
  GetDependencyTaskDocResult
> {
  constructor(config: McpServerConfig) {
    super(config);
  }

  name = 'get_dependency_task_doc';
  description = 'Return the Memory Palace task document path for a dependency task.';
  schema = GetDependencyTaskDocSchema;

  async execute(
    input: GetDependencyTaskDocInput,
  ): Promise<McpToolResult<GetDependencyTaskDocResult>> {
    try {
      const fsAdapter = new NodeFileSystemAdapter();
      const validatedRoot = MemoryPalace.validateRepositoryPath(
        fsAdapter,
        input.repositoryRoot,
      );
      const palace = new MemoryPalace(validatedRoot, fsAdapter);

      const task = palace.getTask(input.taskId);
      if (!task) {
        return this.createErrorResponse(`Task ${input.taskId} not found in Memory Palace.`);
      }

      const docPath = this.resolveTaskDocumentPath(fsAdapter, validatedRoot, task.id, task.status);
      if (!fsAdapter.exists(docPath)) {
        return this.createErrorResponse(
          `Task document not found at expected location: ${docPath}.`,
        );
      }

      return this.createSuccessResponse('Task document located.', {
        success: true,
        taskId: task.id,
        repository: validatedRoot,
        documentPath: docPath,
        status: task.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resolve task document.';
      return this.createErrorResponse(message);
    }
  }

  private resolveTaskDocumentPath(
    fsAdapter: NodeFileSystemAdapter,
    repositoryRoot: string,
    taskId: string,
    status: string,
  ): string {
    const basePath = fsAdapter.join(repositoryRoot, '.palace-work', 'tasks');
    const directory = status === 'completed' ? 'history' : 'active';
    const extension = status === 'completed' ? '.hist.md' : '.task.md';
    return fsAdapter.join(basePath, directory, `${taskId}${extension}`);
  }
}
