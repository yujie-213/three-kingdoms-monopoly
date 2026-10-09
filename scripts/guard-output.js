import { readdir, readFile } from 'node:fs/promises';

// Refuse to touch unrecognized existing files. Vite does not clean dist.
let files;
try { files = await readdir('dist'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  files = [];
}
for (const file of files) {
  if (file !== '三国大富翁.html') throw new Error(`Refusing to overwrite/clean unknown dist file: ${file}`);
  const html = await readFile(`dist/${file}`, 'utf8');
  if (!html.includes('content="three-kingdoms-monopoly"')) {
    throw new Error('Existing release HTML has no project marker; preserve it before building.');
  }
}
