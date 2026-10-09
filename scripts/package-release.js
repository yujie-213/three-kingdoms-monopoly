import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { findResourceDependencies } from './release-validation.js';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const html = await readFile('dist/三国大富翁.html');
const issues = findResourceDependencies(html.toString('utf8'));
if (issues.length) throw new Error(issues.join('\n'));
await mkdir('releases', { recursive: true });
const name = `三国大富翁-v${version}.html`;
// Never overwrite an existing versioned release. Identical content is reusable.
try {
  const previous = await readFile(`releases/${name}`);
  if (!previous.equals(html)) throw new Error('此版本已有不同内容的发布文件，请提升版本号后再发布。');
} catch (error) {
  if (error.code === 'ENOENT') await writeFile(`releases/${name}`, html, { flag: 'wx' });
  else throw error;
}
const hash = createHash('sha256').update(html).digest('hex');
await writeFile(`releases/${name}.sha256`, `${hash}  ${name}\n`);
console.log(`Release ready: ${resolve('releases', name)} (${html.length} bytes), SHA256 ${hash}`);
