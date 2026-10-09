import { describe, expect, it } from 'vitest';
import { findResourceDependencies } from '../../scripts/release-validation.js';

describe('offline publication guard', () => {
  it('accepts inline JS/CSS and embedded data assets', () => {
    expect(findResourceDependencies('<style>body{background:url(data:image/png;base64,AAA)}</style><img src="data:image/png;base64,AAA"><script>document.title="M0"</script>')).toEqual([]);
  });
  it('does not mistake import button strings for JavaScript imports', () => {
    expect(findResourceDependencies('<script>document.querySelector("#confirm-import"); const text="fetch()";</script>')).toEqual([]);
  });
  it.each([
    '<script src="./game.js"></script>',
    '<link rel="stylesheet" href="https://cdn.example/style.css">',
    '<img src="./map.png">',
    '<style>@import "font.css";</style>',
    '<style>body{background:url(./map.png)}</style>',
    '<script>fetch("https://example.com")</script>',
    '<script>import("./event.js")</script>',
    '<template><img src="map.png"></template>',
  ])('rejects dependency: %s', (html) => {
    expect(findResourceDependencies(html).length).toBeGreaterThan(0);
  });
});
