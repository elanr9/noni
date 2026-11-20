import { assert, assertEquals } from 'jsr:@std/assert@1';

import { decodeEntities, htmlToText, pageScore, stripHtml } from './crawlSite.ts';

Deno.test('entities become the characters they stand for', () => {
  assertEquals(decodeEntities('can&#x27;t &amp; won&#39;t &mdash; &quot;ok&quot; &rsquo;til &nbsp;5&euro;'), "can't & won't — \"ok\" ’til  5€");
  // Unknown or broken entities never leak into the text.
  assertEquals(decodeEntities('a&bogus;b &#0; &#xD800;'), 'a b    ');
  assertEquals(stripHtml('<p>Coaches can&#x27;t recruit who they don&#x27;t know<!-- -->.</p>'), "Coaches can't recruit who they don't know.");
});

Deno.test('a page reads as its blocks, without scripts, menus or repeats', () => {
  const html = `<html><head><title>Tidy</title><style>p{color:red}</style></head><body>
    <nav><a href="/pricing">Pricing</a><a href="/login">Log in</a></nav>
    <h1>Plan your week <span>in minutes</span></h1>
    <p>Search <!-- -->2,790<!-- --> schools<a href="/x">now</a>.</p>
    <script>window.__DATA__ = {"secret":"<p>not text</p>"}</script>
    <ul><li>Calendar sync</li><li>Free for 7&nbsp;days</li></ul>
    <button>Get started</button><button>Get started</button>
    <svg><title>logo</title></svg>
  </body></html>`;
  assertEquals(htmlToText(html), ['Plan your week in minutes', 'Search 2,790 schools now.', 'Calendar sync', 'Free for 7 days', 'Get started'].join('\n'));
});

Deno.test('pages worth reading rank above the rest and sign-in or legal pages are never read', () => {
  for (const path of ['/login', '/terms', '/privacy', '/sign-up', '/onboarding', '/cart', '/legal/dpa', '/logo.png', '/', '/blog/some-post', '/colleges/letourneau-university/mens-soccer']) {
    assertEquals(pageScore(path), 0, path);
  }
  assert(pageScore('/pricing') > pageScore('/features'));
  assert(pageScore('/features') > pageScore('/features/calendar-sync'));
  assert(pageScore('/features/calendar-sync') > pageScore('/colleges'));
  assert(pageScore('/colleges') > pageScore('/blog'));
  assert(pageScore('/blog') > 0, 'an index is a last resort, not forbidden');
  // Whole segments only: "tour" is not in "letourneau", "mobile" is not in "university-of-mobile".
  assertEquals(pageScore('/university-of-mobile'), pageScore('/colleges'));
});
