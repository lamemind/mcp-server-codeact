import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve, isAbsolute } from 'path';
import { FileWriteOperation } from '../types/act-operations-schema.js';
import { OperationResult } from '../types/tool-batch-schema.js';

export async function executeFileWrite(operation: FileWriteOperation): Promise<OperationResult> {

  for (const [, file] of operation.files.entries()) {
    try {
      await writeSingleFile(file, operation.workingDir!);

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
  const fullPath = isAbsolute(file.path) ? file.path : resolve(workdir, file.path);
  console.error(`Writing file to: ${fullPath}`);

  if (!fullPath.startsWith(workdir))
    throw new Error(`Invalid file path: ${file.path} is outside the work directory.`);

  const directory = dirname(fullPath);
  await mkdir(directory, { recursive: true });

  // Write file content
  await writeFile(fullPath, file.content, 'utf8');
}
