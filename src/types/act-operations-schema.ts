import { z } from 'zod';


// File write operation
export const FileWriteOperationSchema = z.object({
  type: z.literal('file_write'),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
  workspaceId: z.string()
    .optional()
    .describe("Workspace ID to write the files in, defaults to the batch workspace")
});


// Directory create operation
type DirectoryStructure = {
  [key: string]: DirectoryStructure;
};
const DirectoryStructureSchema: z.ZodType<DirectoryStructure> = z.lazy(() =>
  z.record(
    z.string(), // chiave = nome directory  
    DirectoryStructureSchema // valore = sottostruttura (ricorsivo)
  )
);
export const DirCreateOperationSchema = z.object({
  type: z.literal('dir_create'),
  structure: DirectoryStructureSchema,
  workspaceId: z.string()
    .optional()
    .describe("Workspace ID to create the directories in, defaults to the batch workspace")
});


// Shell execute operation
export const ShellExecOperationSchema = z.object({
  type: z.literal('shell_exec'),
  commands: z.array(z.string()),
  shell: z.enum(['powershell', 'cmd', 'gitbash'])
    .default('cmd')
    .optional(),
  workspaceId: z.string()
    .optional()
    .describe("Workspace ID to execute the shell commands in, defaults to the batch workspace"),
});


// Code execute operation
export const CodeExecOperationSchema = z.object({
  type: z.literal('code_exec'),
  runtime: z.enum(['node', 'php', 'python']),
  code: z.string(),
  workspaceId: z.string()
    .optional()
    .describe("Workspace ID to execute the code in, defaults to the batch workspace"),
});


// Union of all operations
export const BatchOperationSchema = z.discriminatedUnion('type', [
  FileWriteOperationSchema,
  DirCreateOperationSchema,
  ShellExecOperationSchema,
  CodeExecOperationSchema,
]);


// TypeScript types from schemas
export type FileWriteOperation = z.infer<typeof FileWriteOperationSchema>;
export type DirCreateOperation = z.infer<typeof DirCreateOperationSchema>;
export type ShellExecOperation = z.infer<typeof ShellExecOperationSchema>;
export type CodeExecOperation = z.infer<typeof CodeExecOperationSchema>;
export type BatchOperation = z.infer<typeof BatchOperationSchema>;
