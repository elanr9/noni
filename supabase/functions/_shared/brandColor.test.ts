import { describe, expect, it } from 'vitest';

import { detectBrandColor, isBrandLike, normalizeHex, stylesheetLinks } from './brandColor';

describe('brand color from a website', () => {
  it('takes the theme-color the site declares', () => {
    expect(detectBrandColor('<head><meta name="theme-color" content="#1ba6ee"></head>')).toBe('#1BA6EE');
  });

  it('ignores a white or black theme-color and reads the CSS instead', () => {
    const html = '<head><meta name="theme-color" content="#ffffff"><style>:root{--color-primary:#e11d48;--bg:#fff}</style></head>';
    expect(detectBrandColor(html)).toBe('#E11D48');
  });

  it('prefers a color named brand or primary over the most used one', () => {
    const css = '.a{color:#22c55e}.b{color:#22c55e}.c{color:#22c55e}:root{--brand:#7c3aed}';
    expect(detectBrandColor('', [css])).toBe('#7C3AED');
  });

  it('falls back to the saturated color used most, in hex or rgb', () => {
    const css = '.a{color:#111}.b{background:rgb(59 130 246 / 1)}.c{border-color:rgb(59,130,246)}.d{color:#f97316}';
    expect(detectBrandColor('', [css])).toBe('#3B82F6');
  });

  it('finds nothing on a black and white site', () => {
    expect(detectBrandColor('<style>body{color:#111;background:#fff}a{color:#666}</style>')).toBeNull();
  });

  it('does not count link anchors as colors', () => {
    expect(detectBrandColor('<a href="#fab">Pricing</a><a href="#fab">FAQ</a>')).toBeNull();
  });

  it('normalizes short and alpha hex', () => {
    expect(normalizeHex('#0af')).toBe('#00AAFF');
    expect(normalizeHex('#1ba6ee80')).toBe('#1BA6EE');
    expect(isBrandLike('#F7F7F7')).toBe(false);
  });

  it('lists linked stylesheets against the page', () => {
    const html = '<link rel="stylesheet" href="/a.css"><link rel="icon" href="/i.png"><link href="https://cdn.x.com/b.css" rel=stylesheet>';
    expect(stylesheetLinks(html, new URL('https://acme.com/'))).toEqual(['https://acme.com/a.css', 'https://cdn.x.com/b.css']);
  });
});
