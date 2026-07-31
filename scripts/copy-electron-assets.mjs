import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function copyDirectory(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}

function copyFiles(sourceDirectory, destinationDirectory, extension) {
  if (!existsSync(sourceDirectory)) return;
  mkdirSync(destinationDirectory, { recursive: true });
  for (const name of readdirSync(sourceDirectory)) {
    if (!name.endsWith(extension)) continue;
    cpSync(join(sourceDirectory, name), join(destinationDirectory, name), { force: true });
  }
}

copyFiles(
  join(projectRoot, 'electron', 'data', 'migrations'),
  join(projectRoot, 'dist', 'electron', 'data', 'migrations'),
  '.sql',
);
copyDirectory(
  join(projectRoot, 'electron', 'browser-ui'),
  join(projectRoot, 'dist', 'electron', 'browser-ui'),
);
copyDirectory(
  join(projectRoot, 'electron', 'services', 'embedded-browser', 'stealth-scripts'),
  join(projectRoot, 'dist', 'electron', 'services', 'embedded-browser', 'stealth-scripts'),
);
copyDirectory(
  join(projectRoot, 'electron', 'automation', 'python'),
  join(projectRoot, 'dist', 'electron', 'automation', 'python'),
);
