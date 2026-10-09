import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { findResourceDependencies } from './release-validation.js';

const filename = '三国大富翁.html';
assert.deepEqual(await readdir('dist'), [filename], 'dist must contain exactly one HTML file');
const path = resolve('dist', filename);
const html = await readFile(path, 'utf8');
assert.deepEqual(findResourceDependencies(html), [], 'Release has resource dependencies');
assert.match(html, /<script\b[^>]*>[^]*掷骰子/);
assert.match(html, /<style\b/);
console.log(`Single HTML verified: ${path} (${(await stat(path)).size} bytes); JS/CSS inline, no resource references.`);
