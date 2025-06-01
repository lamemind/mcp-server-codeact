import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve, isAbsolute } from 'path';
import { FileWriteOperation } from '../types/act-operations-schema.js';
import { OperationResult } from '../types/tool-batch-schema.js';

export async function executeFileWrite(
  operation: FileWriteOperation,
  workdir: string = process.cwd()
): Promise<OperationResult> {

  for (const [, file] of operation.files.entries()) {
    try {
      writeSingleFile(file, workdir);

    } catch (error) {
      return {
        operationIndex: -1,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    operationIndex: -1,
    status: 'success',
    output: `Succesfully written ${operation.files.length} files`
  };
}

async function writeSingleFile(file: { path: string, content: string }, workdir: string) {
  // Resolve path: absolute paths as-is, relative paths from workdir
  const fullPath = isAbsolute(file.path) ? file.path : resolve(workdir, file.path);
  if (!fullPath.startsWith(workdir))
    throw new Error(`Invalid file path: ${file.path} is outside the work directory.`);

  // Ensure directory exists
  const directory = dirname(fullPath);
  await mkdir(directory, { recursive: true });

  // Write file content
  await writeFile(fullPath, file.content, 'utf8');
}
