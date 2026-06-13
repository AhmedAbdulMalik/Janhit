// c:\Users\iyand\Downloads\Janhit\scripts\build-extension.mjs

import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const rootDir = resolve(process.cwd());
const distDir = resolve(rootDir, 'dist');
const extensionSourceDir = resolve(rootDir, 'src', 'extension');
const workerSourceDir = resolve(rootDir, 'src', 'worker');

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await cp(extensionSourceDir, resolve(distDir, 'extension'), {
    recursive: true,
  });

  await cp(workerSourceDir, resolve(distDir, 'worker'), {
    recursive: true,
  });

  console.log(`Built Janhit into ${distDir}`);
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exitCode = 1;
});