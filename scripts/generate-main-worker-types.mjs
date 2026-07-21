import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptsDirectory, '..', 'siliconbeest');
const wranglerConfigPath = join(projectDirectory, 'wrangler.jsonc');
const typegenConfigPath = join(projectDirectory, '.wrangler.typegen.jsonc');
const wranglerExecutable = join(
  projectDirectory,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);

const runtimeEntrypoint = '"main": ".output/server/index.mjs"';
const typegenEntrypoint = '"main": "server/index.ts"';

const config = await readFile(wranglerConfigPath, 'utf8');
const occurrences = config.split(runtimeEntrypoint).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Expected exactly one ${runtimeEntrypoint} entry in ${wranglerConfigPath}, found ${occurrences}.`,
  );
}

await writeFile(
  typegenConfigPath,
  config.replace(runtimeEntrypoint, typegenEntrypoint),
  'utf8',
);

try {
  const exitCode = await new Promise((resolveExitCode, reject) => {
    const child = spawn(
      wranglerExecutable,
      [
        'types',
        '--config',
        '.wrangler.typegen.jsonc',
        '--env-file',
        '../scripts/typegen.env',
        ...process.argv.slice(2),
      ],
      { cwd: projectDirectory, stdio: 'inherit' },
    );

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`wrangler types terminated by signal ${signal}.`));
        return;
      }
      resolveExitCode(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
} finally {
  await rm(typegenConfigPath, { force: true });
}
