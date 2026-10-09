import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('pages-artifact', { recursive: true });
for (const file of await readdir('pages-artifact')) {
  if (file !== 'index.html') throw new Error(`Unknown Pages artifact file: ${file}`);
  const previous = await readFile('pages-artifact/index.html', 'utf8');
  if (!previous.includes('content="three-kingdoms-monopoly"')) throw new Error('Unknown index.html; preserve it before rebuilding.');
}
await writeFile('pages-artifact/index.html', await readFile('dist/三国大富翁.html'));
console.log(`Static Pages artifact ready: ${resolve('pages-artifact/index.html')}; no deployment performed.`);
