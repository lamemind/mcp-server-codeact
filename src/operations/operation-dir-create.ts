import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { DirCreateOperation } from '../types/act-operations-schema.js';
import { OperationResult } from '../types/tool-batch-schema.js';

export async function executeDirCreate(operation: DirCreateOperation, startWorkingDir: string): Promise<OperationResult> {
  try {
    const directoriesToCreate: string[] = [];
    collectDirectories(operation.structure, startWorkingDir, directoriesToCreate);

    // Create all directories
    for (const dirPath of directoriesToCreate)
      await mkdir(dirPath, { recursive: true });

    return {
      operationIndex: -1,
      status: 'success',
      output: `Created ${directoriesToCreate.length} directories: ${directoriesToCreate.map(d => d.replace(startWorkingDir, '')).join(', ')}`
    };

  } catch (error) {
    return {
      operationIndex: -1,
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function collectDirectories(
  structure: Record<string, any>,
  currentPath: string,
  collector: string[]
): void {
  for (const [dirName, subStructure] of Object.entries(structure)) {
    const dirPath = resolve(currentPath, dirName);
    collector.push(dirPath);

    // Recursively process subdirectories
    if (subStructure && typeof subStructure === 'object')
      collectDirectories(subStructure, dirPath, collector);
  }
}
