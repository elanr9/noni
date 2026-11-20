import { ImportBriefScreen, type ImportApi } from '../../components/admin/v2/importbrief/ImportBriefScreen';
import { newClip, uid, type BriefType } from '../../lib/brief-library';
import type { PlannedPost } from '../../lib/brief-import';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SAMPLE: [string, BriefType, 'document' | 'new', string][] = [
  ['I killed six ferns before this', 'Talking Head', 'document', 'I killed six ferns before I figured out what I was doing wrong.'],
  ['The watering mistake everyone makes', 'Greenscreen', 'document', 'If your leaves look like this, stop watering.'],
  ['Five plants you cannot kill', 'Slideshow', 'document', 'Five plants that survive anything'],
  ['What I wish I knew in my first apartment', 'Long Text', 'new', 'Nobody tells you the window matters more than the pot.'],
  ['My plant shelf, one month in', 'Talking Head', 'new', 'One month ago every plant on this shelf was dying.'],
  ['Stop guessing when to repot', 'Greenscreen', 'new', 'This is what roots look like when they are begging you.'],
];

/** Dev only: the Upload brief flow with canned answers, no session and no model. */
const api: ImportApi = {
  pick: async () => ({ sources: [{ id: uid(), kind: 'file', name: 'Plantly UGC brief Q4.pdf', uri: 'preview://brief.pdf', mime: 'application/pdf', size: 1_840_000 }], tooLarge: [] }),
  plan: async (_company, _sources, count) => {
    await wait(2600);
    const posts: PlannedPost[] = Array.from({ length: count }, (_, index) => {
      const [title, type, origin, hook] = SAMPLE[index % SAMPLE.length];
      return { index, title: index < SAMPLE.length ? title : `${title}, take ${Math.floor(index / SAMPLE.length) + 1}`, type, origin, angle: '', hook };
    });
    return { importId: 'preview', summary: 'Read a 6 page brief with three scripted posts and the brand rules, and planned new posts in the same voice.', posts, skipped: [] };
  },
  write: async (_id, post) => {
    await wait(1800 + Math.random() * 3200);
    if (post.index === 4 && Math.random() < 0.7) throw new Error('preview failure');
    const spoken = post.type === 'Talking Head' || post.type === 'Greenscreen';
    const clips = [
      newClip(spoken ? post.hook : '', { onScreen: spoken ? 'I killed six ferns' : post.hook }),
      newClip(spoken ? 'Turns out I was watering on a schedule instead of checking the soil.' : '', { onScreen: 'Check the soil, not the calendar', shot: 'Finger in the soil, close up.' }),
      newClip(spoken ? 'Now the app tells me when each one is actually dry.' : '', { onScreen: 'It tells me when', shot: 'Phone in hand, the reminder on screen.' }),
      newClip(spoken ? 'Search Plantly if you are tired of buying the same plant twice.' : '', { onScreen: 'Search Plantly', cta: true }),
    ];
    return {
      index: post.index,
      type: post.type,
      plan: { title: post.title, phrase: 'how to keep ferns alive', clips, caption: 'How to keep ferns alive when you have killed every one so far.', tags: ['#planttok', '#ferns', '#plantcare'], angle: '', ai: { hooks: [], warnings: [], referenceNote: null, questions: [], draft: null }, declined: null },
    };
  },
};

export default function ImportBriefPreview() {
  return <ImportBriefScreen companyId="preview" userId={null} briefsHref="/dev-preview/(tabs)/briefs" api={api} />;
}
