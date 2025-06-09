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
  commands: z.array(z.string())
    .describe(`One or more shell commands to execute.
      General usage contract: one row -> one command.
      Hard validation:
        1) Respect specific shell syntax (e.g. powershell does not support && or || operators),
        2) you can use pipes | if supported by the shell,
        3) you can redirect output with > or < if supported by the shell,
        4) do not use semicolons ; to separate commands (one command per row),
        5) Don't run (never in any case) blocking commands like \`tail -f\` or \`docker compose up\`: you'll hit timeouts.`),
  shell: z.enum(['powershell', 'cmd', 'gitbash'])
    .default('cmd')
    .optional(),
  workspaceId: z.string()
    .optional()
    .describe("Workspace ID to execute the shell commands in, defaults to the batch workspace"),
})
  .describe("Shell commands execution operation (supports cmd, powershell and gitbash). General usage contract is to group commands in a single operation, one command per row.");


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
