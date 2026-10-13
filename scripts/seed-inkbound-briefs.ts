// Seeds the Inkbound sample data from
// claude_code_handoff/reference_ui/briefs/ss-data.js.txt: the post types the
// redesign needs, the 8 library features, and week 2 (Oct 11 to 17) with one
// slideshow slot and two reel slots filled. Idempotent: reruns update in place.
//
// Usage: npx tsx scripts/seed-inkbound-briefs.ts

import { loadEnvLocal } from './env';
import { POST_TYPES_REEL, POST_TYPES_SLIDESHOW } from '../lib/brief-copy';

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): void;
};

const COMPANY_ID = '59f83fa9-8c5b-44aa-814e-f7cc863eac3b';
const CREATED_BY = '0f90129c-f298-4a00-a3eb-7acebb9668a4';
const DROP_DATE = '2026-10-11';
const SLIDESHOW_SLOTS = 7;
const REEL_SLOTS = 14;
const API = 'https://api.supabase.com';

type Row = Record<string, unknown>;

async function runSql<T = Row[]>(query: string, attempt = 0): Promise<T> {
  const res = await fetch(`${API}/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'supabase-cli/2.75.0',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    return runSql(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`sql -> ${res.status}: ${text.slice(0, 600)}\n${query.slice(0, 300)}`);
  return (text ? JSON.parse(text) : []) as T;
}

const lit = (v: string | number | boolean | null): string =>
  v === null ? 'null' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v);
const json = (v: unknown): string => `${lit(JSON.stringify(v))}::jsonb`;
const arr = (v: string[]): string => `array[${v.map(lit).join(',')}]::text[]`;

const LIBRARY = [
  { id: 'general', title: 'General', clip: '0:08', desc: 'Inkbound overall. Use when no feature fits the post', cta: "Use Inkbound for your college recruitment, it literally makes the process easier than anything else I've ever seen and is also the cheapest option you'll get because it was built by former D1 soccer players.", general: true },
  { id: 'bestfit', title: 'Best Fit', clip: null, desc: 'Ranks what matters most to you and builds your plan', cta: 'Inkbound built my recruiting plan from what I actually want. Link in bio.', general: false },
  { id: 'hl', title: 'hl-videos', clip: '0:06', desc: 'AI highlight video made in 6 minutes, and you see which schools watched it', cta: 'I can see every coach who watched my film. Inkbound, link in bio.', general: false },
  { id: 'reply', title: 'reply-ai-messages', clip: null, desc: 'Every time a coach replies, a professional response is drafted for you', cta: 'Inkbound drafts my coach replies so I never leave one hanging. Link in bio.', general: false },
  { id: 'search', title: 'ai-school-search', clip: null, desc: 'Ask AI for programs you can actually get into, add them all to a campaign', cta: 'I found the D1 programs I can actually get into in one night. Link in bio.', general: false },
  { id: 'inbox', title: 'inbox', clip: null, desc: 'Your recruitment inbox, every coach reply in one place', cta: 'Every coach reply, one inbox, never missed a follow up. Link in bio.', general: false },
  { id: 'sent', title: 'campaigns-sent', clip: null, desc: 'Mass email college coaches with hyper personalized emails, 50 at a time', cta: 'Inkbound sent 50 coaches a personal email while I was at practice. Link in bio.', general: false },
  { id: 'school', title: 'solo-school', clip: null, desc: 'The full profile of one program: your chance, cost, acceptance, coaches', cta: 'Inkbound told me my real chance at every school. Link in bio.', general: false },
];

const CAPTION = 'Coaches watch the first 10 seconds. Make them count.';
const HASHTAGS = ['collegesoccer', 'highlightvideo', 'd1recruiting', 'soccerrecruiting', 'collegerecruiting'];
const SEARCH = 'soccer highlight video tips';

const CTA_BOXES = {
  box: { x: 0.44, y: 0.56, w: 0.66 },
  inset_box: { x: 0.44, y: 0.27, w: 0.42 },
  box_ig: { x: 0.5, y: 0.64, w: 0.72 },
  inset_box_ig: { x: 0.5, y: 0.38, w: 0.42 },
};

function handheldSlides(hl: string) {
  return [
    { role: 'cover', text: '5 tips for the perfect highlight video', shot: "You on the pitch, phone at arm's length", inset_feature_id: null },
    { role: 'point', text: 'Best clip first. Coaches decide in 10 seconds.', shot: 'A still from your best goal or play', inset_feature_id: null },
    { role: 'point', text: 'Keep it under 3 minutes. Nobody watches minute 4.', shot: 'You editing on your laptop', inset_feature_id: null },
    { role: 'point', text: 'Spot shadow yourself before every clip so they know who to watch.', shot: 'A game photo where you are easy to find', inset_feature_id: null },
    { role: 'point', text: 'No music. Coaches mute it anyway.', shot: 'Any training photo', inset_feature_id: null },
    { role: 'point', text: 'Put your name, grad year, position and email on the first frame.', shot: 'Your current team photo', inset_feature_id: null },
    { role: 'cta', text: 'Tip 3: Inkbound makes your highlight video in 6 minutes.', shot: 'Celebration or team photo', inset_feature_id: hl, ...CTA_BOXES },
  ];
}

function reelSlides(hl: string) {
  return [
    { role: 'cover', text: '5 tips for the perfect highlight video', shot: 'If a coach closes your film in ten seconds, it is not your fault. Nobody told you these five things.', inset_feature_id: null },
    { role: 'point', text: 'Best plays first', shot: 'Cut to your best clip', inset_feature_id: null },
    { role: 'point', text: 'Under 3 minutes', shot: 'Three minutes max. Nobody watches minute four.', inset_feature_id: null },
    { role: 'point', text: 'Spot shadow yourself', shot: 'Show the freeze frame', inset_feature_id: null },
    { role: 'point', text: 'No music', shot: 'Skip the music. Coaches mute it anyway.', inset_feature_id: null },
    { role: 'point', text: 'Name and grad year on frame one', shot: 'Name, grad year, position and email on the first frame.', inset_feature_id: null },
    { role: 'cta', text: 'Tip 3: Inkbound makes your highlight video in 6 minutes.', shot: 'Screen recording plays over you', inset_feature_id: hl, ...CTA_BOXES },
  ];
}

async function main(): Promise<void> {
  loadEnvLocal();
  if (!process.env.SUPABASE_ACCESS_TOKEN || !process.env.SUPABASE_PROJECT_REF) {
    console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required in .env.local');
    process.exit(1);
    return;
  }
  const C = lit(COMPANY_ID);

  // Post types the redesign offers, created when the company lacks them.
  for (const t of [...POST_TYPES_SLIDESHOW, ...POST_TYPES_REEL]) {
    await runSql(
      `insert into post_types (company_id, key, label, family, min_points, max_points, clip_structure, requires_plug, requires_credential, sort_order)
       values (${C}, ${lit(t.key)}, ${lit(t.name)}, ${lit(t.format === 'reel' ? 'video' : 'photo_carousel')}, ${t.minPoints}, ${t.maxPoints}, ${lit(t.clipStructure)}, ${t.clipStructure !== 'single_clip'}, false, 100)
       on conflict (company_id, key) do update set label = excluded.label, min_points = excluded.min_points, max_points = excluded.max_points, clip_structure = excluded.clip_structure`,
    );
  }
  const types = await runSql<{ id: string; key: string }[]>(`select id, key from post_types where company_id = ${C}`);
  const typeId = (key: string): string => {
    const row = types.find((t) => t.key === key);
    if (!row) throw new Error(`post type ${key} missing`);
    return row.id;
  };

  // Library features. source 'manual' marks them as seeded by hand; approved so RLS shows them.
  const featureIds: Record<string, string> = {};
  for (const f of LIBRARY) {
    const rows = await runSql<{ id: string }[]>(
      `with up as (
         update product_features set what_it_does = ${lit(f.desc)}, claim = ${lit(f.cta)}, is_general = ${f.general}, approved = true, rejected = false
          where company_id = ${C} and name = ${lit(f.title)} returning id
       ), ins as (
         insert into product_features (company_id, name, what_it_does, claim, surface, source, source_ref, approved, rejected, is_general)
         select ${C}, ${lit(f.title)}, ${lit(f.desc)}, ${lit(f.cta)}, null, 'manual', ${lit(`ss-data:${f.id}`)}, true, false, ${f.general}
          where not exists (select 1 from up) returning id
       )
       select id from up union all select id from ins`,
    );
    featureIds[f.id] = rows[0].id;
  }

  // Week 2: a campaign with 14 reel and 7 slideshow stamped rows.
  const existing = await runSql<{ id: string }[]>(
    `select id from campaigns where company_id = ${C} and drop_date = ${lit(DROP_DATE)} order by created_at desc limit 1`,
  );
  let campaignId = existing[0]?.id;
  if (!campaignId) {
    const created = await runSql<{ id: string }[]>(
      `insert into campaigns (company_id, name, drop_date, status, video_target, slideshow_target, type_split)
       values (${C}, 'Week 2', ${lit(DROP_DATE)}, 'draft', ${REEL_SLOTS}, ${SLIDESHOW_SLOTS}, '{}'::jsonb) returning id`,
    );
    campaignId = created[0].id;
    const formats = [
      ...Array.from({ length: REEL_SLOTS }, () => 'video'),
      ...Array.from({ length: SLIDESHOW_SLOTS }, () => 'photo_carousel'),
    ];
    const briefs = await runSql<{ id: string }[]>(
      `insert into briefs (company_id, created_by, title, format)
       values ${formats.map((f) => `(${C}, ${lit(CREATED_BY)}, 'Untitled post', ${lit(f)})`).join(',')} returning id`,
    );
    await runSql(
      `insert into campaign_briefs (campaign_id, brief_id, company_id, position)
       values ${briefs.map((b, i) => `(${lit(campaignId!)}, ${lit(b.id)}, ${C}, ${i})`).join(',')}`,
    );
  }

  const lanes = await runSql<{ id: string; format: string }[]>(
    `select b.id, b.format from campaign_briefs cb join briefs b on b.id = cb.brief_id
      where cb.campaign_id = ${lit(campaignId)} order by cb.position`,
  );
  const reels = lanes.filter((l) => l.format === 'video');
  const shows = lanes.filter((l) => l.format === 'photo_carousel');
  const hl = featureIds.hl;

  // Slideshow slot 01: handheld, Numbered tips.
  await runSql(
    `update briefs set kind = 'handheld', post_type_id = ${lit(typeId('numbered_tips'))}, title = 'College soccer program red flags',
       caption = ${lit(CAPTION)}, hashtags = ${arr(HASHTAGS)}, search_phrase = ${lit(SEARCH)},
       slides = ${json(handheldSlides(hl))}, cta = ${lit('Tip 3: Inkbound makes your highlight video in 6 minutes.')}, cta_feature_id = ${lit(hl)},
       creator_note = ${lit('Use real game photos, not stock. Your own film if you have it.')}, status = 'ready'
     where id = ${lit(shows[0].id)}`,
  );
  // Reel slot 01: handheld, Numbered list.
  await runSql(
    `update briefs set kind = 'handheld', post_type_id = ${lit(typeId('numbered_list'))}, title = '5 tips for the perfect highlight video',
       caption = ${lit(CAPTION)}, hashtags = ${arr(HASHTAGS)}, search_phrase = ${lit(SEARCH)},
       slides = ${json(reelSlides(hl))}, cta = ${lit('Tip 3: Inkbound makes your highlight video in 6 minutes.')}, cta_feature_id = ${lit(hl)},
       creator_note = ${lit('Natural light. Say the hook to camera, then cut.')}, status = 'ready'
     where id = ${lit(reels[0].id)}`,
  );
  // Reel slot 02: story, Talking head.
  await runSql(
    `update briefs set kind = 'story', post_type_id = ${lit(typeId('talking_head'))}, title = 'What a $40 camera sees that your coach misses',
       slides = ${json([
         { role: 'cover', text: 'What a $40 camera sees that your coach misses', shot: '', inset_feature_id: null },
         { role: 'cta', text: 'Inkbound got my film in front of 40 coaches. Link in bio.', shot: '', inset_feature_id: hl },
       ])},
       story = ${json({ theme: 'What a $40 camera sees that your coach misses', beats: [], min: 3, max: 6 })},
       cta = ${lit('Inkbound got my film in front of 40 coaches. Link in bio.')}, cta_feature_id = ${lit(hl)},
       creator_note = ${lit('Say your credential first.')}, status = 'ready'
     where id = ${lit(reels[1].id)}`,
  );

  const summary = await runSql<{ format: string; filled: number; total: number }[]>(
    `select b.format, count(b.kind)::int as filled, count(*)::int as total
       from campaign_briefs cb join briefs b on b.id = cb.brief_id
      where cb.campaign_id = ${lit(campaignId)} group by b.format order by 1`,
  );
  console.log(`campaign ${campaignId}`);
  for (const s of summary) console.log(`  ${s.format.padEnd(16)} ${s.filled} / ${s.total}`);
  console.log(`  features ${Object.keys(featureIds).length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
