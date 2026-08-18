import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const webDirectory = resolve(projectDirectory, '..', 'web');
const outputDirectory = resolve(projectDirectory, 'public');
const assets = ['index.html', 'styles.css', 'app.js'];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  assets.map((asset) => copyFile(resolve(webDirectory, asset), resolve(outputDirectory, asset)))
);

console.log(`Prepared ${assets.length} static assets in ${outputDirectory}`);

