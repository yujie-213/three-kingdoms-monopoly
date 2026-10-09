import { parse } from 'parse5';
import { parse as parseJavaScript } from 'acorn';

export function findResourceDependencies(html) {
  const issues = [];
  const inline = (value) => value.startsWith('data:') || value.startsWith('#');
  const checkCss = (css) => {
    if (/@import\b/i.test(css)) issues.push('CSS @import is forbidden');
    for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      if (!inline(match[2].trim())) issues.push(`CSS URL: ${match[2]}`);
    }
  };
  const walk = (node) => {
    const attrs = Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
    for (const name of ['src', 'href', 'poster', 'data', 'xlink:href']) {
      if (attrs[name] !== undefined && !inline(attrs[name])) issues.push(`${node.tagName}[${name}]: ${attrs[name]}`);
    }
    if (attrs.srcset) issues.push('srcset must be reviewed before enabling');
    if (attrs.style) checkCss(attrs.style);
    if (node.tagName === 'style') checkCss((node.childNodes || []).map((n) => n.value || '').join(''));
    if (node.tagName === 'script') {
      const js = (node.childNodes || []).map((n) => n.value || '').join('');
      if (js.trim()) {
        try {
          const ast = parseJavaScript(js, { ecmaVersion: 'latest', sourceType: 'module' });
          const stack = [ast];
          while (stack.length) {
            const item = stack.pop();
            if (!item || typeof item !== 'object') continue;
            if (['ImportDeclaration', 'ImportExpression', 'ExportAllDeclaration'].includes(item.type)
              || (item.type === 'ExportNamedDeclaration' && item.source)
              || (item.type === 'Identifier' && ['fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'EventSource'].includes(item.name))) {
              issues.push('Runtime imports/network APIs require explicit release review'); break;
            }
            for (const value of Object.values(item)) {
              if (Array.isArray(value)) stack.push(...value);
              else if (value && typeof value === 'object') stack.push(value);
            }
          }
        } catch { issues.push('Cannot parse inline JavaScript'); }
      }
    }
    for (const child of node.childNodes || []) walk(child);
    if (node.content) walk(node.content);
  };
  walk(parse(html));
  return issues;
}
