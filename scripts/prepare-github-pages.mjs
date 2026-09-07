import { access, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const repositoryName = 'FY26-Optimization-Lab';
const clientDirectory = path.resolve('dist/client');
const nestedDirectory = path.join(clientDirectory, repositoryName);
const nestedNextDirectory = path.join(nestedDirectory, '_next');
const publicNextDirectory = path.join(clientDirectory, '_next');

try {
  await access(nestedNextDirectory);
} catch {
  throw new Error(
    `Expected GitHub Pages assets at ${nestedNextDirectory}, but the directory was not created.`,
  );
}

try {
  await access(publicNextDirectory);
  throw new Error(
    `Refusing to overwrite the existing output directory at ${publicNextDirectory}.`,
  );
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

await rename(nestedNextDirectory, publicNextDirectory);
await rm(nestedDirectory, { recursive: true });

console.log('GitHub Pages assets are ready in dist/client/_next.');
