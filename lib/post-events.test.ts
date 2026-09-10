import { describe, expect, it } from 'vitest';

import {
  approvedLabel,
  assignedLabel,
  buildPostEvents,
  liveLabel,
  parseNotes,
  sentBackLabel,
  sortByTime,
  submittedLabel,
} from './post-event-labels';

describe('post event labels', () => {
  it('names the weekday for assigned', () => {
    expect(assignedLabel('2026-09-09')).toBe('Assigned for Wednesday');
    expect(assignedLabel('2026-09-08', 'Mara')).toBe('Assigned to Mara for Tuesday');
  });

  it('formats submitted takes for reels and slideshows', () => {
    expect(
      submittedLabel({ attempt: 2, format: 'video', clips: 7, durationSeconds: 52 }),
    ).toBe('Submitted take 2 \u00b7 7 clips \u00b7 0:52');
    expect(
      submittedLabel({ attempt: 1, format: 'photo_carousel', clips: 5, durationSeconds: null }),
    ).toBe('Submitted take 1 \u00b7 5 slides');
    expect(
      submittedLabel({ attempt: 1, format: 'video', clips: null, durationSeconds: null }),
    ).toBe('Submitted take 1');
  });

  it('counts notes, pluralised', () => {
    expect(sentBackLabel(1)).toBe('Sent back \u00b7 1 note');
    expect(sentBackLabel(2)).toBe('Sent back \u00b7 2 notes');
  });

  it('marks approved as posting until live, and live with views', () => {
    const wed = new Date(2026, 8, 9, 17, 0).toISOString();
    expect(approvedLabel(wed, false)).toBe('Approved \u00b7 posts Wed 5:00 PM');
    expect(approvedLabel(null, false)).toBe('Approved');
    expect(approvedLabel(wed, true)).toBe('Approved');
    expect(liveLabel(null)).toBe('Live');
    expect(liveLabel(412_000)).toBe('Live \u00b7 412k views');
    expect(liveLabel(950)).toBe('Live \u00b7 950 views');
  });
});

describe('parseNotes', () => {
  it('splits Review notes back into label and text', () => {
    expect(parseNotes('Point 3: Move the phone off the rail.\n\nOutro: Say the plug slower.')).toEqual([
      { label: 'Point 3', text: 'Move the phone off the rail.' },
      { label: 'Outro', text: 'Say the plug slower.' },
    ]);
  });

  it('falls back to Whole post for unlabeled text', () => {
    expect(parseNotes('Tighter cuts please')).toEqual([
      { label: 'Whole post', text: 'Tighter cuts please' },
    ]);
    expect(parseNotes(null)).toEqual([]);
  });
});

describe('buildPostEvents', () => {
  const assignment = {
    id: 'a1',
    company_id: 'c1',
    creator_id: 'cr1',
    brief_id: 'b1',
    created_at: '2026-09-06T21:10:00.000Z',
    scheduled_date: '2026-09-08',
    status: 'submitted',
    submission_id: 's2',
    publish_at: null,
    briefs: { title: 'Two setups', format: 'video', post_types: { label: 'Talking head' } },
    profiles: { full_name: 'Mara Ionescu' },
  };

  const built = buildPostEvents({
    assignments: [assignment],
    submissions: [
      {
        id: 's1',
        assignment_id: 'a1',
        version: 1,
        created_at: '2026-09-07T14:30:00.000Z',
        duration_seconds: 55,
        segment_paths: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        video_path: 'v1.mp4',
      },
      {
        id: 's2',
        assignment_id: 'a1',
        version: 2,
        created_at: '2026-09-07T18:02:00.000Z',
        duration_seconds: 52,
        segment_paths: ['a', 'b'],
        video_path: 'v2.mp4',
      },
    ],
    reviewEvents: [
      {
        id: 'e1',
        submission_id: 's1',
        author_id: 'm1',
        action: 'changes_requested',
        note: 'Point 3: Rail buzz.\n\nOutro: Slower.',
        notes: null,
        created_at: '2026-09-07T15:02:00.000Z',
        profiles: { full_name: 'Elan Romo' },
      },
    ],
    posts: [],
    viewsByPost: new Map(),
    managerNames: new Map(),
    inPostThread: true,
  });

  it('orders assigned, take 1, sent back, take 2', () => {
    expect(built.events.map((e) => e.kind)).toEqual([
      'assigned',
      'submitted',
      'sent_back',
      'submitted',
    ]);
  });

  it('parses legacy notes and flags the waiting take', () => {
    const sentBack = built.events[2];
    expect(sentBack.label).toBe('Sent back \u00b7 2 notes');
    expect(sentBack.notes).toEqual([
      { label: 'Point 3', text: 'Rail buzz.' },
      { label: 'Outro', text: 'Slower.' },
    ]);
    expect(built.events[1].waiting).toBe(false);
    expect(built.events[3].waiting).toBe(true);
    expect(built.events[3].label).toBe('Submitted take 2 \u00b7 2 clips \u00b7 0:52');
  });

  it('builds the card summary from the latest take', () => {
    const summary = built.summaries.get('a1');
    expect(summary?.attempt).toBe(2);
    expect(summary?.mediaPath).toBe('v2.mp4');
    expect(summary?.typeLabel).toBe('Talking head');
    expect(built.events[0].label).toBe('Assigned to Mara Ionescu for Tuesday');
  });
});

describe('sortByTime', () => {
  it('sorts by time and puts events before messages at the same instant', () => {
    const items = [
      { id: 'm', kind: 'message', at: '2026-09-07T18:02:00.000Z' },
      { id: 'e', kind: 'submitted', at: '2026-09-07T18:02:00.000Z' },
      { id: 'earlier', kind: 'message', at: '2026-09-07T09:00:00.000Z' },
    ];
    expect(sortByTime(items).map((i) => i.id)).toEqual(['earlier', 'e', 'm']);
  });
});
