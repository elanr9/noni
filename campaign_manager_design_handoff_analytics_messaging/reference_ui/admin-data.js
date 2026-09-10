/* Sample content for the Noni admin kit. Tenant: FieldVision AI — college
   soccer recruiting tech. Every post plugs the product inside one talking
   point; nothing here is a standalone ad beat. Formats are video (Reel) and
   photo_carousel (Slideshow), never video-only. */
window.NONI_ADMIN = {
  company: { name: 'FieldVision AI', admin: 'Elan' },

  creators: [
    { id: 'c1', name: 'Fabri Duarte', short: 'Fabri', initial: 'F', tiktok: 'fabri.d1soccer', instagram: 'fabri.d1soccer', credential: 'D1 midfielder, Class of 2027', earned: '$1,840', posts: 34, views: '2.4M', status: 'approved' },
    { id: 'c2', name: 'Mara Ionescu', short: 'Mara', initial: 'M', tiktok: 'mara.keeps', instagram: 'mara.keeps', credential: 'Keeper, committed to Pitt', earned: '$1,275', posts: 28, views: '1.6M', status: 'approved' },
    { id: 'c3', name: 'Deniz Aksoy', short: 'Deniz', initial: 'D', tiktok: 'deniz.on.ball', instagram: 'deniz.onball', credential: 'JUCO transfer, 2 offers', earned: '$910', posts: 21, views: '870K', status: 'approved' },
    { id: 'c4', name: 'Sofia Reyes', short: 'Sofia', initial: 'S', tiktok: 'sofia.recruitfilm', instagram: 'sofia.recruitfilm', credential: 'Class of 2028, uncommitted', earned: '$0', posts: 0, views: '—', status: 'pending' },
  ],

  /* Queue 1 — post submissions, newest first. */
  submissions: [
    { id: 's1', creator: 'c1', title: 'The tripod setup that took 90 seconds', type: 'talking_head', typeLabel: 'Talking head', format: 'video', clips: 5, duration: '0:38', age: '14m ago', attempt: 1, status: 'submitted' },
    { id: 's2', creator: 'c3', title: '3 stats that decide Sunday', type: 'numbered_tips', typeLabel: 'Numbered tips', format: 'photo_carousel', clips: 5, duration: '5 slides', age: '52m ago', attempt: 1, status: 'submitted' },
    { id: 's3', creator: 'c2', title: 'Why your winger fades after 70 minutes', type: 'numbered_list', typeLabel: 'Numbered list', format: 'video', clips: 7, duration: '0:52', age: '2h ago', attempt: 2, status: 'submitted' },
    { id: 's4', creator: 'c1', title: 'Highlight reel vs full match film', type: 'contrast', typeLabel: 'Contrast', format: 'video', clips: 6, duration: '0:44', age: '5h ago', attempt: 1, status: 'submitted' },
    { id: 's5', creator: 'c2', title: 'Getting your first film clip tagged', type: 'getting_started', typeLabel: 'Getting started', format: 'photo_carousel', clips: 4, duration: '4 slides', age: 'Yesterday', attempt: 1, status: 'submitted' },
  ],

  /* Queue 2 — music approvals. Slideshows only, one tap. */
  music: [
    { id: 'm1', creator: 'c1', title: '4 drills we tagged this week', format: 'photo_carousel', slides: 4, posted: 'Live 3h ago', marked: 'Marked added 12m ago', platforms: 'TikTok · Instagram', song: 'Sunkissed · sped up' },
    { id: 'm2', creator: 'c3', title: 'How to film a match from one corner', format: 'photo_carousel', slides: 6, posted: 'Live 9h ago', marked: 'Marked added 1h ago', platforms: 'TikTok · Instagram', song: 'Vlog beat · instrumental' },
  ],

  /* Queue 3 — creator account approval, once per creator. */
  accounts: [
    { id: 'a1', creator: 'c4', state: 'pending', submitted: 'Submitted 1h ago', tiktok: 'sofia.recruitfilm', instagram: 'sofia.recruitfilm', ig: { label: 'Instagram scroll', need: '20s — home, explore, reels', got: '0:22' }, tt: { label: 'TikTok For You scroll', need: '15s minimum, continuous', got: '0:19' }, shots: 2 },
    { id: 'a2', creator: 'c3', state: 'needs_changes', submitted: 'Sent back 2d ago', tiktok: 'deniz.on.ball', instagram: 'deniz.onball', reason: 'Feed is not college soccer', note: 'For You is gym and car content. Follow 20 college soccer and recruiting accounts, scroll for two days, then record again.', ig: { label: 'Instagram scroll', need: '20s — home, explore, reels', got: '0:21' }, tt: { label: 'TikTok For You scroll', need: '15s minimum, continuous', got: '0:16' }, shots: 2 },
  ],

  /* Reel review — one row per clip in the render manifest. */
  segments: [
    { slot: 'Hook', text: 'You do not need a camera crew. You need one phone and a fence.', overlay: 'ONE PHONE. ONE FENCE.', len: '0:06', state: 'ok' },
    { slot: 'Point 1', text: 'Clamp it at the halfway line, chest height, and press record.', overlay: 'Halfway line, chest height', len: '0:09', state: 'ok' },
    { slot: 'Point 2', text: 'Walk away. You are coaching, not filming.', overlay: '', len: '0:07', state: 'ok' },
    { slot: 'Point 3', text: 'FieldVision tags every touch off that one angle, so the film is cut before you get home.', overlay: 'Cut before you get home', len: '0:11', state: 'flagged', note: 'Plug is clear but the audio clips at 0:04. Re-record this one.' },
    { slot: 'Outro', text: 'Comment D1 and I will send you the clamp we use.', overlay: 'Comment D1', len: '0:05', state: 'ok' },
  ],

  slides: [
    { n: 1, overlay: 'Three numbers decide most Sunday matches. None of them are goals.', shot: false },
    { n: 2, overlay: 'Recoveries in the final third', shot: true },
    { n: 3, overlay: 'Passes before a shot', shot: true },
    { n: 4, overlay: 'Distance covered after minute 70', shot: false },
    { n: 5, overlay: 'FieldVision tags all three off one phone angle. Comment D1 for the template.', shot: false },
  ],

  thread: [
    { from: 'admin', name: 'You', time: '2d ago', body: 'Point 3 audio clipped. Same setup, just move the phone off the fence rail.' },
    { from: 'creator', name: 'Mara', time: '2d ago', body: 'Rail was buzzing. Reshot it on the tripod, take 2 is up.' },
  ],

  chat: [
    { from: 'creator', name: 'Mara', time: 'Mon 09:14', body: 'Field is booked till 6 today, I will shoot both after.' },
    { from: 'admin', name: 'You', time: 'Mon 09:20', body: 'Works. The contrast one needs daylight, keep that first.' },
    { from: 'admin', time: 'Mon 09:21', ref: { title: 'Highlight reel vs full match film', format: 'video', meta: 'Contrast · 6 clips' } },
    { from: 'creator', name: 'Mara', time: 'Mon 18:02', body: 'Both up. Take 2 on the winger one, the rail was buzzing on take 1.' },
    { from: 'creator', name: 'Mara', time: 'Mon 18:03', media: 'image', body: 'Setup from today.' },
    { from: 'admin', name: 'You', time: 'Tue 07:41', body: 'Approved. Posting Wednesday 5pm.' },
  ],

  /* Briefs — the week pool. 30 posts, four row states. */
  week: {
    label: 'Week 14',
    range: 'Aug 10–16',
    videoTarget: 20, slideshowTarget: 10,
    videoDone: 7, slideshowDone: 3,
    split: [
      { type: 'numbered_list', label: 'Numbered list', planned: 8, actual: 8 },
      { type: 'talking_head', label: 'Talking head', planned: 5, actual: 6 },
      { type: 'explainer', label: 'Explainer', planned: 3, actual: 2 },
      { type: 'contrast', label: 'Contrast', planned: 2, actual: 2 },
      { type: 'replay_bait', label: 'Replay bait', planned: 2, actual: 2 },
    ],
    slideSplit: [
      { type: 'numbered_tips', label: 'Numbered tips', planned: 5, actual: 5 },
      { type: 'how_to', label: 'How to', planned: 3, actual: 3 },
      { type: 'getting_started', label: 'Getting started', planned: 2, actual: 2 },
    ],
    rows: [
      { n: 1, type: 'numbered_list', typeLabel: 'Numbered list', format: 'video', state: 'complete', title: '5 things coaches check before they reply', points: 5, score: 88 },
      { n: 2, type: 'talking_head', typeLabel: 'Talking head', format: 'video', state: 'complete', title: 'The tripod setup that took 90 seconds', points: 3, score: 92 },
      { n: 3, type: 'contrast', typeLabel: 'Contrast', format: 'video', state: 'filled', title: 'Highlight reel vs full match film', points: 4 },
      { n: 4, type: 'numbered_list', typeLabel: 'Numbered list', format: 'video', state: 'partial', title: 'Why your winger fades after 70 minutes', points: 5, filled: 'Hook and 3 of 5 points' },
      { n: 5, type: 'explainer', typeLabel: 'Explainer', format: 'video', state: 'empty', phrase: 'why am I not getting recruited for college soccer' },
      { n: 6, type: 'replay_bait', typeLabel: 'Replay bait', format: 'video', state: 'empty', phrase: 'college soccer id camp worth it' },
      { n: 7, type: 'numbered_list', typeLabel: 'Numbered list', format: 'video', state: 'killed', kill: 'No approved claim covers transfer portal timing' },
      { n: 8, type: 'talking_head', typeLabel: 'Talking head', format: 'video', state: 'empty', phrase: 'what do college coaches look for in film' },
    ],
    slideRows: [
      { n: 1, type: 'numbered_tips', typeLabel: 'Numbered tips', format: 'photo_carousel', state: 'complete', title: '3 stats that decide Sunday', points: 5, score: 84 },
      { n: 2, type: 'how_to', typeLabel: 'How to', format: 'photo_carousel', state: 'filled', title: 'How to film a match from one corner', points: 6 },
      { n: 3, type: 'getting_started', typeLabel: 'Getting started', format: 'photo_carousel', state: 'partial', title: 'Getting your first film clip tagged', points: 4, filled: 'Hook and 2 of 4 slides' },
      { n: 4, type: 'numbered_tips', typeLabel: 'Numbered tips', format: 'photo_carousel', state: 'empty', phrase: 'soccer recruiting timeline sophomore year' },
    ],
  },

  /* Post editor — one filled post. */
  post: {
    n: 4, type: 'numbered_list', typeLabel: 'Numbered list', format: 'video',
    title: 'Why your winger fades after 70 minutes',
    titleOptions: [
      'Why your winger fades after 70 minutes',
      'The 70th minute is a running problem',
      'Your winger is not unfit, he is unserved',
    ],
    phrase: 'why my winger fades after 70 minutes',
    phraseAlts: [
      'winger tired second half soccer',
      'off ball runs college soccer film',
    ],
    derived: 'Hook + 5 points + outro = 7 clips',
    clipSlots: ['Hook', 'Clip 1', 'Clip 2', 'Clip 3', 'Clip 4', 'Clip 5', 'Outro'],
    hook: 'Your winger runs the wrong runs, not too few.',
    hookOptions: [
      'Your winger runs the wrong runs, not too few.',
      'Nobody fades at 70 minutes by accident.',
      'I tagged 400 wide runs so you do not have to.',
      'Your winger covers 11km and touches the ball nine times.',
      'The 70th minute is a data problem, not a fitness one.',
      'Coaches blame the legs. The film blames the runs.',
    ],
    points: [
      { n: 1, text: 'Count the runs he makes before minute 30. It is usually double what he makes after 60.', shot: null, move: 'Clip 1' },
      { n: 2, text: 'Most of them are outside-shoulder runs that never get played. That is the waste.', shot: 'Pass map, Sat vs Ridgeview', move: 'Clip 2', green: true, place: 'Top right', overlay: { text: 'Runs nobody plays', color: 'var(--white)', bg: true, pos: 'Top' } },
      { n: 3, text: 'FieldVision tags every off-ball run off one phone angle, so you can see which ones actually got served.', plug: true, shot: 'Run map, second half', move: 'Clip 3' },
      { n: 4, text: 'Cut the three runs nobody plays and he still has legs at 80.', shot: null, move: 'Clip 4' },
      { n: 5, text: 'Show him the map, not the stopwatch.', shot: null, move: 'Clip 5' },
    ],
    cta: 'FieldVision tags every off-ball run off one phone angle.',
    claim: 'Off-ball run tagging from a single fixed camera',
    caption: 'Why my winger fades after 70 minutes: he runs the wrong runs, not too few. Full breakdown below.',
    hashtags: ['#collegesoccer', '#soccerrecruiting', '#matchfilm', '#u17'],
    example: 'tiktok.com/@sundayleaguetape/video/7391…',
    segments: [
      { slot: 'Hook', overlay: 'WRONG RUNS, NOT TIRED LEGS', show: true, shot: false },
      { slot: 'Point 1', overlay: 'Double the runs before minute 30', show: true, shot: false },
      { slot: 'Point 2', overlay: 'Outside-shoulder runs nobody plays', show: true, shot: true },
      { slot: 'Point 3', overlay: 'Every run tagged from one angle', show: true, shot: true },
      { slot: 'Point 4', overlay: '', show: false, shot: false },
      { slot: 'Point 5', overlay: 'Show the map, not the stopwatch', show: true, shot: false },
      { slot: 'Outro', overlay: 'Comment D1', show: true, shot: false },
    ],
    review: {
      overall: 78,
      sections: [
        { key: 'Hook', score: 71, note: 'Nine words exactly. The second clause is the stronger opening.', suggestion: null, fix: 'Open on “wrong runs” and drop the comparison.' },
        { key: 'Talking points', score: 84, note: 'Plug sits inside point 3 and traces to an approved claim.', suggestion: null },
        { key: 'CTA', score: 66, note: 'Reads written, not spoken.', suggestion: 'Say the plug the way you would say it on a touchline.', fix: 'Replace “off one phone angle” with “from the one phone on the fence”.' },
      ],
      checks: [
        { label: 'Hook ≤ 9 words', pass: true },
        { label: '4 hashtags', pass: true },
        { label: 'Search phrase in first sentence of caption', pass: true },
        { label: 'One plug, inside a talking point', pass: true },
        { label: 'Second person 5.8 per 100 words', pass: true },
        { label: 'Hedge words: “just” in point 4', pass: false },
        { label: 'Reads as spoken', pass: false, quote: '“Show him the map, not the stopwatch.”' },
      ],
    },
  },

  /* Post editor — the slideshow variant of the same wizard. */
  slidePost: {
    n: 2, type: 'how_to', typeLabel: 'How to', format: 'photo_carousel',
    title: 'How to film a match from one corner',
    titleOptions: ['How to film a match from one corner', 'One corner, one phone, whole match'],
    phrase: 'how to film a soccer game by yourself',
    phraseAlts: ['filming youth soccer from the stands', 'best phone angle for match film'],
    derived: 'Cover slide + 4 steps + close = 6 slides',
    clipSlots: ['Cover', 'Slide 1', 'Slide 2', 'Slide 3', 'Slide 4', 'Close'],
    hook: 'One corner beats four parents with phones.',
    hookOptions: [
      'One corner beats four parents with phones.',
      'Stop filming from the halfway line.',
      'The corner flag is the only angle you need.',
      'Four parents, four angles, zero usable film.',
      'Film the whole match without holding a phone.',
      'Your best camera position is already on the field.',
    ],
    cta: 'FieldVision builds the pass map off that one corner angle.',
    claim: 'Pass map in 20 seconds',
    points: [
      { n: 1, text: 'Stand at the corner nearest your bench. You want the far touchline in frame.', shot: 'Corner setup, phone on clamp', move: 'Slide 1' },
      { n: 2, text: 'Clamp at head height and lock the exposure before kickoff.', shot: null, move: 'Slide 2' },
      { n: 3, text: 'FieldVision builds the pass map off that one corner angle, so nobody has to hold a phone.', plug: true, shot: 'Pass map from corner angle', move: 'Slide 3' },
      { n: 4, text: 'Record the whole half in one take. Do not stop between phases.', shot: null, move: 'Slide 4' },
    ],
    caption: 'How to film a soccer game by yourself: one corner, head height, one take. Steps in the slides.',
    hashtags: ['#collegesoccer', '#matchfilm', '#soccerparents'],
    example: 'tiktok.com/@d1.keeper/video/7402…',
    review: {
      overall: 84,
      sections: [
        { key: 'Hook', score: 86, note: 'Seven words, and it names the mistake instead of the fix.' },
        { key: 'Talking points', score: 88, note: 'Steps run in order and the plug sits inside step 3.' },
        { key: 'Caption', score: 74, note: 'Phrase is in the first sentence. Three hashtags is the floor.', suggestion: 'Add one more tag.', fix: 'Add #youthsoccer to reach four.' },
      ],
      checks: [
        { label: 'Hook ≤ 9 words', pass: true },
        { label: '3 hashtags', pass: true },
        { label: 'Search phrase in first sentence of caption', pass: true },
        { label: 'One plug, inside a talking point', pass: true },
        { label: 'Slide count matches the type', pass: true },
      ],
    },
  },

  library: {
    ideas: [
      { id: 'l1', body: 'Coaches ignore highlight reels sent in July. Post about the actual window.', age: '2h ago' },
      { id: 'l2', body: 'The one drill clip that got Mara three replies.', age: 'Yesterday' },
      { id: 'l3', body: 'What a 31% possession drop looks like on film.', age: '3d ago' },
    ],
    ours: [
      { id: 'o1', title: 'Half-time talk, but with data', creator: 'Fabri', format: 'video', views: '412K', when: 'Jul 24' },
      { id: 'o2', title: '4 drills we tagged this week', creator: 'Mara', format: 'photo_carousel', views: '128K', when: 'Jul 21' },
      { id: 'o3', title: 'Reading a pass map in 20 seconds', creator: 'Deniz', format: 'video', views: '96K', when: 'Jul 19' },
      { id: 'o4', title: '5 things coaches check before they reply', creator: 'Fabri', format: 'photo_carousel', views: '81K', when: 'Jul 14' },
    ],
    refs: [
      { id: 'r1', title: 'I tagged 400 goal kicks so you do not have to', handle: 'sundayleaguetape', format: 'video', views: '2.1M' },
      { id: 'r2', title: 'Nobody talks about keeper distribution', handle: 'd1.keeper', format: 'photo_carousel', views: '480K' },
    ],
    fromCreator: [
      { id: 'f1', body: 'My coach asked how the pass map is built. Could be a whole post.', creator: 'Deniz', age: '1d ago' },
      { id: 'f2', body: 'Parents keep asking what to film from the stands.', creator: 'Fabri', age: '4d ago' },
    ],
  },

  analytics: {
    range: '30 days',
    headline: { views: '1.9M', revenue: '$16.4k', posts: 118 },
    series: [12, 18, 15, 24, 31, 28, 22, 35, 41, 38, 33, 47, 52, 44, 58, 61, 49, 66, 72, 63, 70, 84, 77, 91, 86, 98, 104, 96, 112, 121],
    events: [3, 0, 2, 5, 1, 4, 0, 6, 3, 2, 7, 4, 1, 5, 8, 3, 2, 6, 9, 4, 3, 7, 5, 11, 6, 8, 4, 9, 12, 7],
    perCreator: [
      { name: 'Fabri Duarte', views: '842K', revenue: '$6,180', posts: 34 },
      { name: 'Mara Ionescu', views: '611K', revenue: '$5,240', posts: 28 },
      { name: 'Deniz Aksoy', views: '447K', revenue: '$4,980', posts: 21 },
    ],
    hooks: [
      { text: 'I tagged 400 goal kicks so you do not have to', views: '312K' },
      { text: 'Your winger runs the wrong runs, not too few.', views: '288K' },
      { text: 'Coaches ignore reels sent in July. Here is why.', views: '204K' },
    ],
  },

  features: [
    { name: 'Off-ball run tagging', state: 'approved', body: 'Tags every off-ball run from a single fixed camera angle.' },
    { name: 'Pass map in 20 seconds', state: 'approved', body: 'Full pass map generated from one phone on a tripod.' },
    { name: 'Bulk coach emails', state: 'approved', body: 'Sends a film link to a filtered list of college coaches.' },
    { name: 'Auto highlight cut', state: 'rejected', body: 'Not shipped. Do not claim automatic highlight generation.' },
  ],

  brain: [
    { key: 'Product', words: 412, updated: 'Updated 2d ago' },
    { key: 'Audience', words: 268, updated: 'Updated 6d ago' },
    { key: 'Voice', words: 331, updated: 'Updated 2w ago' },
    { key: 'Learnings', words: 96, updated: 'Updated today' },
  ],

  calendar: [
    { day: 'Mon 10', items: [{ t: 'Tripod setup', c: 'Fabri', f: 'video', s: 'approved' }, { t: '3 stats Sunday', c: 'Deniz', f: 'photo_carousel', s: 'submitted' }] },
    { day: 'Tue 11', items: [{ t: 'Winger fades', c: 'Mara', f: 'video', s: 'assigned' }] },
    { day: 'Wed 12', items: [{ t: 'Highlight vs film', c: 'Fabri', f: 'video', s: 'assigned' }, { t: 'One corner', c: 'Deniz', f: 'photo_carousel', s: 'assigned' }, { t: 'First clip tagged', c: 'Mara', f: 'photo_carousel', s: 'recorded' }] },
    { day: 'Thu 13', items: [{ t: 'ID camp truth', c: 'Fabri', f: 'video', s: 'assigned' }] },
    { day: 'Fri 14', items: [{ t: 'Coach reply window', c: 'Mara', f: 'photo_carousel', s: 'assigned' }, { t: 'Film from stands', c: 'Deniz', f: 'video', s: 'assigned' }] },
    { day: 'Sat 15', items: [] },
    { day: 'Sun 16', items: [{ t: 'Weekend recap', c: 'Fabri', f: 'video', s: 'assigned' }] },
  ],
};
