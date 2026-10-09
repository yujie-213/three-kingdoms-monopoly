// Deliberately handles only Vite's static entry script and CSS.
// Images/fonts imported by source must be data URLs; any remaining asset fails.
export function singleHtmlPlugin() {
  return {
    name: 'single-html-release',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = bundle['index.html'];
      if (!entry) throw new Error('Missing HTML entry');
      let html = String(entry.source);
      const inlined = new Set(['index.html']);
      const scripts = [];
      html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_tag, src) => {
        const name = src.replace(/^\.\//, '');
        const chunk = bundle[name];
        if (chunk?.type !== 'chunk') throw new Error(`Cannot inline script: ${src}`);
        inlined.add(name);
        scripts.push(`<script>${chunk.code.replace(/<\/script/gi, '<\\/script')}</script>`);
        return '';
      });
      html = html.replace(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/g, (_tag, href) => {
        const name = href.replace(/^\.\//, '');
        const asset = bundle[name];
        if (asset?.type !== 'asset') throw new Error(`Cannot inline CSS: ${href}`);
        inlined.add(name);
        return `<style>${String(asset.source).replace(/<\/style/gi, '<\\/style')}</style>`;
      });
      for (const name of Object.keys(bundle)) {
        if (!inlined.has(name)) throw new Error(`Uninlined asset: ${name}`);
      }
      // Classic inline scripts have no module defer semantics. Run after DOM.
      if (!html.includes('</body>')) throw new Error('Missing body closing tag');
      html = html.replace('</body>', `${scripts.join('\n')}\n  </body>`);
      for (const name of inlined) delete bundle[name];
      bundle['三国大富翁.html'] = { type: 'asset', fileName: '三国大富翁.html', source: html };
    },
  };
}
