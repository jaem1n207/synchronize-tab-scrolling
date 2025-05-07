import { resolve } from 'node:path';
import process from 'node:process';

import { bgCyan, black } from 'kolorist';
import { z } from 'zod';

const envVariables = z.object({
  PORT: z.string().optional().default('3303').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  EXTENSION: z.union([z.literal('firefox'), z.undefined()]).optional(),
});

const getEnvIssues = (): z.ZodIssue[] | void => {
  const result = envVariables.safeParse(process.env);
  if (!result.success) return result.error.issues;
};
const issues = getEnvIssues();
if (issues) {
  console.error('Invalid environment variables:');
  process.exit(9);
}

const validatedEnv = envVariables.parse(process.env);

export const port = validatedEnv.PORT;
export const r = (...args: string[]) => resolve(__dirname, '..', ...args);
export const isDev = validatedEnv.NODE_ENV !== 'production';
export const isFirefox = validatedEnv.EXTENSION === 'firefox';

export function log(name: string, message: string) {
  console.log(black(bgCyan(` ${name} `)), message);
}
