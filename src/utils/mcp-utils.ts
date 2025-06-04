import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import z from "zod";

export function validateAndParseInput<T>(args: unknown, schema: z.ZodObject<any, "strip", z.ZodTypeAny, any, any>): T {
    const validationResult = schema.safeParse(args);
    if (!validationResult.success)
        throw new McpError(ErrorCode.InvalidParams, `Invalid input parameters: ${validationResult.error.message}`);

    return validationResult.data as T;
}

export type ToolOutput = {
    content: Array<{
        type: string;
        text: string;
    }>;
};

export function formatToolOuput(output: any): ToolOutput {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(output, null, 2),
            },
        ],
    };
}