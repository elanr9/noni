import type {
  Creator,
  MockQueueItem,
  MockThreadEntry,
  ScriptLine,
  TaskCopy,
  WeekGridRow,
} from './admin-review-types';

export const MOCK_HANDLE = '@fieldvision.ai';

export const MOCK_CREATORS: Creator[] = [
  { id: 'fabri', name: 'Fabri', initial: 'F' },
  { id: 'mara', name: 'Mara', initial: 'M' },
  { id: 'deniz', name: 'Deniz', initial: 'D' },
  { id: 'tolu', name: 'Tolu', initial: 'T' },
  { id: 'rhea', name: 'Rhea', initial: 'R' },
];

const byId = (id: string): Creator => {
  const creator = MOCK_CREATORS.find((c) => c.id === id);
  if (!creator) throw new Error(`Unknown mock creator: ${id}`);
  return creator;
};

/** README §8 queue, newest first. */
export const MOCK_QUEUE: MockQueueItem[] = [
  {
    id: 'task-mara',
    creator: byId('mara'),
    title: 'Why your winger fades after 70 minutes',
    format: 'video',
    lengthLabel: '0:52',
    ageLabel: '4m ago',
    status: 'submitted',
    resubmitted: false,
  },
  {
    id: 'task-fabri',
    creator: byId('fabri'),
    title: 'The tripod setup that took 90 seconds',
    format: 'video',
    lengthLabel: '0:38',
    ageLabel: '22m ago',
    status: 'submitted',
    resubmitted: false,
  },
  {
    id: 'task-deniz',
    creator: byId('deniz'),
    title: '3 stats that win Sunday',
    format: 'photo_carousel',
    lengthLabel: '4 slides',
    ageLabel: '1h ago',
    status: 'submitted',
    resubmitted: false,
  },
  {
    id: 'task-tolu',
    creator: byId('tolu'),
    title: 'What a 31% possession drop looks like',
    format: 'video',
    lengthLabel: '0:41',
    ageLabel: '3h ago',
    status: 'submitted',
    resubmitted: true,
  },
  {
    id: 'task-rhea',
    creator: byId('rhea'),
    title: 'Reading a pass map in 20 seconds',
    format: 'photo_carousel',
    lengthLabel: '6 slides',
    ageLabel: 'Yesterday',
    status: 'submitted',
    resubmitted: false,
  },
];

/** README §5.2 reference script (Mara, 0:52). */
export const MOCK_SCRIPT_MARA: ScriptLine[] = [
  { at: 0, text: "Your winger isn't unfit. He's sprinting the wrong yards." },
  { at: 8, text: 'We tracked 60 wide players across a full season.' },
  {
    at: 19,
    text: "The ones who faded after 70 covered the same distance as the ones who didn't.",
  },
  { at: 31, text: 'They just did it recovering, not attacking.' },
  { at: 44, text: 'FieldVision splits the two on one chart. Link in bio.' },
];

/** README §5.4 changes-requested thread, chronological, oldest first. */
export const MOCK_THREAD_TOLU: MockThreadEntry[] = [
  {
    author: 'creator',
    headerBold: 'Tolu',
    headerMuted: 'Take 1 \u00b7 Monday',
    body: 'First take. Filmed at the training ground, sound was a bit windy.',
  },
  {
    author: 'admin',
    headerBold: 'Changes requested',
    headerMuted: 'You \u00b7 Monday',
    body: 'Hook lands late. Start on the 31% number, and reshoot indoors \u2014 the wind eats the first line.',
  },
  {
    author: 'creator',
    headerBold: 'Tolu',
    headerMuted: 'Take 2 \u00b7 3h ago',
    body: 'Reshot in the analysis room. Opens on 31% now.',
  },
];

// TODO: seed from design_handoff_admin_app/admin-mock-data.ts (file not yet in repo) — do not invent content
export const MOCK_COPY: TaskCopy[] = [];
export const WEEK_LIGHT: WeekGridRow[] = [];
export const WEEK_HEAVY: WeekGridRow[] = [];
