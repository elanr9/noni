/**
 * Dev-only sample data for the v2 preview routes (app/dev-preview). Seeds the
 * library and post stores so screens can be checked without a session. Never
 * imported by production screens.
 */
import type { AnalyticsDay } from './analytics-api';
import { newClip, outlineTwinId, stText, type Brief, type BriefKind, type BriefType } from './brief-library';
import { longTextPlan } from './brief-ai';
import { useLibStore } from './brief-library-api';
import { addDays, dayKey, today } from './v2-format';
import { useV2Data, type V2Creator, type V2Post } from './v2-posts';

const CREATORS: V2Creator[] = [
  { id: 'fab', name: 'Fabrizio', handle: '@fabri.fv', photo: 'https://i.pravatar.cc/160?img=12', tone: 'blue', posts: 0, views: 0, earnedCents: 0 },
  { id: 'elan', name: 'Elan', handle: '@elan.plays', photo: 'https://i.pravatar.cc/160?img=33', tone: 'purple', posts: 0, views: 0, earnedCents: 0 },
  { id: 'jacob', name: 'Jacob', handle: '@jacobfilm', photo: 'https://i.pravatar.cc/160?img=59', tone: 'green', posts: 0, views: 0, earnedCents: 0 },
  { id: 'maya', name: 'Maya', handle: '@maya.pitch', photo: 'https://i.pravatar.cc/160?img=47', tone: 'amber', posts: 0, views: 0, earnedCents: 0 },
];

const TITLES = [
  '5 things film reveals that your coach misses',
  'How to track your sprint speed from one phone video',
  'Why your first touch looks slow on camera',
  'What a $40 tripod does for your highlight reel',
  '3 passes scouts rewind every time',
  'How I found my weak foot stat in 2 minutes',
  'Stop filming from the sideline. Do this instead',
  'The one number every striker should know',
  'How to send film a coach actually opens',
  'Reacting to my own heat map',
  'Things nobody tells you about getting scouted',
  'Your off ball runs, scored',
  'How to film a full match on a phone',
  'Why 90 minutes of film gets closed in 10 seconds',
  '4 myths about getting recruited',
  'How to cut a 3 minute reel from a full game',
  'The pass map that got me a trial',
  'What coaches look at first on FieldVision',
  'Recovery speed: the stat nobody films',
  'How to tag your best plays in one tap',
  'My recruiting week, start to finish',
];

const SCRIPT = {
  hook: 'If a coach closes your film in ten seconds, it is not your fault. Nobody told you these five things.',
  points: ['Your off ball runs', 'Where you look before the pass', 'How fast you recover', 'Your first touch under pressure', 'Who you pass to when tired'],
  close: 'FieldVision scores all five from one phone video. Link in bio.',
};

function stats(views: number, share: number) {
  const v = Math.round(views * share);
  return { views: v, likes: Math.round(v * 0.071), comments: Math.round(v * 0.006), shares: Math.round(v * 0.009), saves: Math.round(v * 0.012) };
}

function samplePosts(): V2Post[] {
  const t0 = today();
  const out: V2Post[] = [];
  const states = ['Posted', 'Posted', 'Approved', 'Waiting', 'Recording', 'Posted', 'Changes requested'] as const;
  // Five weeks back to today, three posts a day across the creators.
  for (let d = 34; d >= -3; d--) {
    const date = addDays(t0, -d);
    for (let k = 0; k < 3; k++) {
      const i = (d + 3) * 3 + k;
      const c = CREATORS[i % 4];
      const state = d > 0 ? (i % 11 === 0 ? 'Changes requested' : 'Posted') : d === 0 ? states[k] : 'Recording';
      if (date > t0 && state === 'Posted') continue;
      const views = state === 'Posted' ? 2400 + ((i * 7919) % 41000) : 0;
      out.push({
        id: `p${d}-${k}`,
        assignmentId: `p${d}-${k}`,
        briefId: null,
        libraryBriefId: null,
        title: TITLES[(i * 5) % TITLES.length],
        creatorId: c.id,
        creatorName: c.name,
        state,
        date,
        format: k === 2 ? 'Slideshow' : 'Reel',
        views,
        tiktok: stats(views, 0.62),
        instagram: stats(views, 0.38),
        postUrl: state === 'Posted' ? `https://www.tiktok.com/${c.handle}/video/${7200000000000 + i}` : null,
        earnedCents: state === 'Posted' ? 4000 : 0,
        mediaPath: null,
        mediaFormat: k === 2 ? 'photo_carousel' : 'video',
      });
    }
  }
  return out;
}

function sampleDays(posts: V2Post[]): AnalyticsDay[] {
  const t0 = today();
  const days: AnalyticsDay[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = addDays(t0, -i);
    const key = dayKey(d);
    const ids = posts.filter((p) => p.state === 'Posted' && dayKey(p.date) === key).map((p) => p.id);
    const base = [48, 61, 54, 88, 72, 51, 38][d.getDay()] * 1000;
    days.push({ day: key, views: Math.round(base * (0.6 + ((i * 7) % 5) * 0.12)), signups: 0, salesCents: 0, postIds: ids });
  }
  return days;
}

function sampleBriefs(): Brief[] {
  const rows: [BriefType, BriefKind, string, string, number][] = [
    ['Talking Head', 'Guided', '5 things film reveals that your coach misses', 'Hook: name the problem in one line.\nMiddle: five quick points, one example each.\nClose: FieldVision scores all five from one phone video.', 2],
    ['Slideshow', 'Guided', 'How to film a full match on a phone', 'Slide 1: the mistake everyone makes.\nSlides 2 to 5: tripod, angle, zoom, battery.\nLast slide: link in bio.', 5],
    ['Long Text', 'Outline', 'Why 90 minutes of film gets closed in 10 seconds', 'Text on screen with a calm voiceover. Lead with the ten second stat, end on the FieldVision cut.', 9],
    ['Greenscreen', 'Guided', 'Reacting to my own heat map', 'Creator over the FieldVision heat map screenshot. Point at the cold zones, laugh at the sideline camping.', 24],
    ['Talking Head', 'Outline', 'The one number every striker should know', 'Keep it under 20 seconds. Say the number early, explain it once, plug at the end.', 26],
    ['Slideshow', 'Outline', '4 myths about getting recruited', 'One myth per slide, the truth under it in smaller text. Last slide is the app.', 48],
    ['Long Text', 'Guided', 'How to send film a coach actually opens', 'Clip: Coaches open one in ten links. Send a 40 second reel, not a full match, and put the score in the file name.', 72],
    ['Greenscreen', 'Outline', 'What coaches look at first on FieldVision', 'Creator over the dashboard. Walk through the first three stats a coach sees.', 96],
  ];
  const out: Brief[] = [];
  rows.forEach(([type, kind, title, notes, hours], i) => {
    const id = `b${i}`;
    const ts = Date.now() - hours * 36e5;
    const base: Brief = { id, type, kind, title, notes, link: '', by: 'Sam', ts, audio: null, clips: null, g: null, lt: null, from: null, caption: '', tags: [] };
    if (kind === 'Guided') {
      const clips =
        type === 'Long Text'
          ? [newClip('', { onScreen: longTextPlan(title) })]
          : [SCRIPT.hook, ...SCRIPT.points.slice(0, 3), SCRIPT.close].map((text, k, a) => newClip(text, { onScreen: k === 0 ? title : k === a.length - 1 ? 'FieldVision scores your film' : `${k}. ${text}`, cta: k === a.length - 1 }));
      base.clips = type === 'Greenscreen' ? clips.map((c) => ({ ...c, green: true, gs: { src: 'gs-3', label: 'Heat map', kind: 'video', dur: 12 } })) : clips;
      base.audio = { mode: i === 1 ? 'pick' : 'creator', track: i === 1 ? { id: 't1', title: 'golden hour', artist: 'JVKE', dur: 212 } : null };
      if (type !== 'Long Text') base.caption = `${title}. FieldVision scores your film from one phone video.`;
      if (type !== 'Long Text') base.tags = ['#collegesoccer', '#soccerrecruiting'];
      if (type === 'Slideshow') base.clips[base.clips.length - 1].doc = { texts: [stText('FieldVision scores your film', { y: 22, size: 20 })], overlays: [{ id: 'prod', x: 50, y: 62, w: 58, src: 'grad:app', label: 'App screen' }] };
      out.push(base);
      out.push({ ...base, id: outlineTwinId(id), kind: 'Outline', clips: null, g: null, audio: null, caption: '', tags: [], ts: ts - 1, from: id });
    } else {
      out.push(base);
    }
  });
  return out;
}

let seeded = false;
/** Seed both stores once. Call from a dev preview route. */
export function seedPreviewData(): void {
  if (seeded) return;
  seeded = true;
  const posts = samplePosts();
  const creators = CREATORS.map((c) => {
    const mine = posts.filter((p) => p.creatorId === c.id && p.state === 'Posted');
    return { ...c, posts: mine.length, views: mine.reduce((n, p) => n + p.views, 0), earnedCents: mine.length * 4000 };
  });
  useV2Data.getState().seed({ posts, creators, days: sampleDays(posts) });
  useLibStore.getState().seed(sampleBriefs());
}
