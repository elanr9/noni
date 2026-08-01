import type { TaskStatus } from './tasks';

/** Displayed as "Reel" | "Slideshow". */
export type ContentFormat = 'video' | 'photo_carousel';

export type Creator = { id: string; name: string; initial: string };

/** 1f script list; mock only for now. */
export type ScriptLine = { at: number; text: string };

export type MockQueueItem = {
  id: string;
  creator: Creator;
  title: string;
  format: ContentFormat;
  lengthLabel: string;
  ageLabel: string;
  status: TaskStatus;
  resubmitted: boolean;
};

/** One bubble in the changes-requested thread (README §5.4). `headerBold` is the 13/700 string, `headerMuted` the 13/400 slate-400 string. */
export type MockThreadEntry = {
  author: 'creator' | 'admin';
  headerBold: string;
  headerMuted: string;
  body: string;
};

export type TaskCopy = { taskId: string; hook: string; caption: string };

export type WeekGridRow = {
  creatorId: string;
  days: Array<{
    day: string;
    task: { title: string; format: ContentFormat; status: TaskStatus } | null;
  }>;
};
