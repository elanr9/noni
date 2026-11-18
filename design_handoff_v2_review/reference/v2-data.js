/* Sample content for the Noni v2 admin prototype. FieldVision AI: football technology brand. */
(() => {
const creators = [
  { id: 'fab', name: 'Fabrizio', handle: '@fabri.fv', posts: 14, views: 184200, earned: 1240, online: true, photo: 'https://i.pravatar.cc/160?img=12', tone: 'blue' },
  { id: 'elan', name: 'Elan', handle: '@elan.plays', posts: 11, views: 96400, earned: 860, online: false, photo: 'https://i.pravatar.cc/160?img=33', tone: 'purple' },
  { id: 'jacob', name: 'Jacob', handle: '@jacobfilm', posts: 9, views: 142900, earned: 720, online: true, photo: 'https://i.pravatar.cc/160?img=59', tone: 'green' },
  { id: 'maya', name: 'Maya', handle: '@maya.pitch', posts: 4, views: 31200, earned: 180, online: false, photo: 'https://i.pravatar.cc/160?img=47', tone: 'amber' },
];
const titles = [
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
const formats = ['Reel', 'Reel', 'Slideshow'];
const kinds = ['Guided', 'Outlined', 'Unscripted', 'Guided'];
const types = ['Numbered list', 'Talking head', 'How to', 'Explainer', 'Storytime', 'Numbered tips', 'Myths'];
const states = ['Posted', 'Posted', 'Approved', 'Waiting', 'Recording', 'Posted', 'Open', 'Changes requested'];
const mk = (i, weekOffset) => {
  const c = creators[i % 4];
  const state = weekOffset < 0 ? (i % 9 === 0 ? 'Changes requested' : 'Posted') : weekOffset > 0 ? 'Open' : states[i % states.length];
  const posted = state === 'Posted';
  return {
    id: `p${weekOffset}-${i}`, title: titles[(i + Math.max(0, weekOffset) * 5) % titles.length],
    format: formats[i % 3], kind: kinds[i % 4], type: types[i % 7], creator: c.id, creatorName: c.name, state,
    views: posted ? 2400 + ((i * 7919) % 41000) : 0, sales: posted ? ((i * 37) % 160) : 0,
    day: (i % 7) + 1, take: 1 + (i % 3),
  };
};
const week = (n, status, offset) => {
  const posts = Array.from({ length: 21 }, (_, i) => mk(i, offset));
  const done = posts.filter((p) => p.state === 'Posted').length;
  const views = posts.reduce((a, p) => a + p.views, 0), sales = posts.reduce((a, p) => a + p.sales, 0);
  const days = status === 'current' ? 4 : status === 'next' ? 0 : 7;
  return { n, status, range: ['Sep 21 to 27', 'Sep 28 to Oct 4', 'Oct 5 to 11', 'Oct 12 to 18', 'Oct 19 to 25'][n - 1], day: days, posts, done,
    reels: posts.filter((p) => p.format === 'Reel').length, slides: posts.filter((p) => p.format === 'Slideshow').length,
    perDay: days ? { sales: Math.round(sales / days), views: Math.round(views / days), posts: +(done / days).toFixed(1) } : null, creators: 4, views, sales };
};
const weeks = [week(5, 'next', 1), week(4, 'current', 0), week(3, 'done', -1), week(2, 'done', -2), week(1, 'done', -3)];
const cur = weeks[1];
const queue = cur.posts.filter((p) => p.state === 'Waiting' || p.state === 'Changes requested').concat([
  { ...mk(3, 0), id: 'q-extra1', title: 'How to film a full match on a phone', creator: 'fab', creatorName: 'Fabrizio', state: 'Waiting', format: 'Slideshow', kind: 'Guided', type: 'How to', take: 1 },
  { ...mk(8, 0), id: 'q-extra2', title: '5 Tips for the Perfect Highlight Video', creator: 'fab', creatorName: 'Fabrizio', state: 'Waiting', format: 'Reel', kind: 'Outlined', type: 'Storytime', take: 2 },
  { ...mk(5, 0), id: 'q-extra3', title: 'Why 90 minutes of film gets closed in 10 seconds', creator: 'elan', creatorName: 'Elan', state: 'Waiting', format: 'Reel', kind: 'Guided', type: 'Explainer', take: 1 },
  { ...mk(9, 0), id: 'q-extra4', title: '4 myths about getting recruited', creator: 'jacob', creatorName: 'Jacob', state: 'Waiting', format: 'Slideshow', kind: 'Guided', type: 'Myths', take: 1 },
  { ...mk(1, 0), id: 'q-extra5', title: 'Stop filming from the sideline. Do this instead', creator: 'fab', creatorName: 'Fabrizio', state: 'Waiting', format: 'Reel', kind: 'Guided', type: 'Talking head', take: 1 },
]);
queue.forEach((q, i) => { if (q.id.startsWith('p0-') && i % 2) { q.creator = ['elan', 'jacob'][i % 2 ? 0 : 1]; q.creatorName = window.__cn = q.creator === 'elan' ? 'Elan' : 'Jacob'; } });
const ages = ['12m', '48m', '2h', '3h', '5h', '9h', '1d', '1d'];
const extraCreators = [
  { id: 'noa', name: 'Noa', handle: '@noa.kicks', posts: 6, views: 52000, earned: 410, online: true, photo: 'https://i.pravatar.cc/160?img=5', tone: 'pink' },
  { id: 'leo', name: 'Leo', handle: '@leo.striker', posts: 8, views: 77000, earned: 520, online: false, photo: 'https://i.pravatar.cc/160?img=15', tone: 'blue' },
  { id: 'sofia', name: 'Sofia', handle: '@sofia.gk', posts: 5, views: 44000, earned: 300, online: true, photo: 'https://i.pravatar.cc/160?img=25', tone: 'purple' },
  { id: 'tom', name: 'Tom', handle: '@tomwinger', posts: 7, views: 61000, earned: 480, online: false, photo: 'https://i.pravatar.cc/160?img=52', tone: 'green' },
  { id: 'ana', name: 'Ana', handle: '@ana.cf9', posts: 3, views: 21000, earned: 150, online: false, photo: 'https://i.pravatar.cc/160?img=44', tone: 'amber' },
  { id: 'kai', name: 'Kai', handle: '@kai.films', posts: 9, views: 98000, earned: 640, online: true, photo: 'https://i.pravatar.cc/160?img=57', tone: 'blue' },
];
const busyQueue = extraCreators.flatMap((c, ci) => Array.from({ length: 1 + (ci % 4) }, (_, j) => ({ ...mk(ci * 3 + j, 0), id: `busy-${c.id}-${j}`, creator: c.id, creatorName: c.name, state: j === 2 ? 'Changes requested' : 'Waiting', take: j === 2 ? 2 : 1 })));
busyQueue.forEach((q, i) => { q.age = ages[(i + 3) % ages.length]; q.duration = q.format === 'Reel' ? ['0:34', '0:52', '0:41', '1:08'][i % 4] : `${5 + (i % 4)} slides`; q.points = 3 + (i % 4); });
queue.forEach((q, i) => { q.age = ages[i % ages.length]; q.duration = q.format === 'Reel' ? ['0:34', '0:52', '0:41', '1:08'][i % 4] : `${5 + (i % 4)} slides`; q.points = 3 + (i % 4); });
const music = [
  { id: 'm1', song: 'Sprint (sped up)', artist: 'Kavi', creator: 'fab', creatorName: 'Fabrizio', post: 'Your off ball runs, scored', age: '1h' },
  { id: 'm2', song: 'golden hour', artist: 'JVKE', creator: 'jacob', creatorName: 'Jacob', post: 'How I found my weak foot stat in 2 minutes', age: '6h' },
];
const accounts = [
  { id: 'a1', creator: 'maya', creatorName: 'Maya', platform: 'TikTok', handle: '@maya.pitch', followers: 1240, age: '2d' },
];
const script = {
  hook: 'If a coach closes your film in ten seconds, it is not your fault. Nobody told you these five things.',
  points: ['Your off ball runs', 'Where you look before the pass', 'How fast you recover', 'Your first touch under pressure', 'Who you pass to when tired'],
  close: 'FieldVision scores all five from one phone video. Link in bio.',
  caption: 'Coaches see what you do without the ball. Now you can too. #football #soccerrecruiting #fieldvision',
};
const analytics = {
  week: { views: 412300, sales: 3120, posts: 38, signups: 214, prevViews: 318900, prevSales: 2640 },
  days: [{ d: 'Mon', v: 48 }, { d: 'Tue', v: 61 }, { d: 'Wed', v: 54 }, { d: 'Thu', v: 88 }, { d: 'Fri', v: 72 }, { d: 'Sat', v: 51 }, { d: 'Sun', v: 38 }],
  topPosts: cur.posts.filter((p) => p.views > 0).sort((a, b) => b.views - a.views).slice(0, 5),
  formats: [{ name: 'Reel', posts: 26, views: 301100, sales: 2210 }, { name: 'Slideshow', posts: 12, views: 111200, sales: 910 }],
  stripeSince: 'Aug 11',
};
const dms = [
  { id: 'd-fab', kind: 'creator', who: 'fab', name: 'Fabrizio', last: 'Sent take 2, moved the plug earlier', at: '12m', unread: 2 },
  { id: 'd-team', kind: 'team', who: 'sam', name: 'Sam (FieldVision)', photo: 'https://i.pravatar.cc/160?img=68', last: 'Can we push the tripod post to Thursday?', at: '1h', unread: 1 },
  { id: 'd-jacob', kind: 'creator', who: 'jacob', name: 'Jacob', last: 'You: Approved, posts at 6', at: '3h', unread: 0 },
  { id: 'd-maya', kind: 'creator', who: 'maya', name: 'Maya', last: 'Is a 9 slide ok or too long?', at: '5h', unread: 0 },
  { id: 'd-elan', kind: 'creator', who: 'elan', name: 'Elan', last: 'You: Looks great, send it', at: '1d', unread: 0 },
];
const channels = [
  { id: 'c-all', name: '#everyone', last: 'Sam: Week 4 briefs are live', at: '2d', unread: 0, members: 6 },
  { id: 'c-wins', name: '#wins', last: 'Fabrizio: 41k on the sprint video', at: '3d', unread: 0, members: 6 },
];
const thread = [
  { from: 'them', text: 'Hey, take 2 is up. Moved the FieldVision plug to point 3 like you said.', at: '9:12' },
  { from: 'me', text: 'Saw it. Hook is way better.', at: '9:14' },
  { from: 'them', text: 'Should I film the recovery speed one tomorrow or wait for the tripod?', at: '9:15' },
  { from: 'me', text: 'Film it tomorrow. Handheld is fine for that one.', at: '9:16' },
  { from: 'them', text: 'Sent take 2, moved the plug earlier', at: '9:20', post: 'The pass map that got me a trial' },
];
const events = [
  { at: 'Mon 9:02', text: 'Brief opened' },
  { at: 'Tue 18:40', text: 'Take 1 sent' },
  { at: 'Tue 19:05', text: 'You requested changes: hook too long' },
  { at: 'Wed 9:20', text: 'Take 2 sent' },
];
window.V2 = { co: { name: 'FieldVision AI', mark: 'F' }, creators, extraCreators, busyQueue, weeks, cur, queue, music, accounts, script, analytics, dms, channels, thread, events,
  fmt: (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n),
  money: (n) => '$' + n.toLocaleString('en-US'),
  creator: (id) => creators.concat(extraCreators).find((c) => c.id === id),
};
})();
