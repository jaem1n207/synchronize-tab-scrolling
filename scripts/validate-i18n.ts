import process from 'node:process';

import { validateI18nTrees } from './i18n-validation';

async function main(): Promise<void> {
  const result = await validateI18nTrees(process.cwd());

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

void main();
