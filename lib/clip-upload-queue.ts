// In-memory per-submission queue that finishes clips in the background while
// the creator keeps recording: one slot at a time, a single automatic retry,
// and a subscribable snapshot the record screen renders as a progress pill.
// The screen owns what a job does (export, upload, draft write); the queue
// only sequences it.
import { useSyncExternalStore } from 'react';

export type ClipJobStatus = 'queued' | 'working' | 'done' | 'failed';

export type ClipJob = {
  slotIndex: number;
  status: ClipJobStatus;
  attempts: number;
  error: string | null;
};

export type ClipQueueState = {
  jobs: Record<number, ClipJob>;
  /** Slots still queued or working, in run order. */
  pending: number[];
  failed: number[];
  /** Jobs done since the queue was last empty; drives "Uploading 3 of 8". */
  done: number;
  total: number;
  idle: boolean;
};

export type ClipJobRunner = (slotIndex: number) => Promise<void>;

const MAX_ATTEMPTS = 2;

const EMPTY: ClipQueueState = {
  jobs: {},
  pending: [],
  failed: [],
  done: 0,
  total: 0,
  idle: true,
};

export class ClipUploadQueue {
  private jobs: Record<number, ClipJob> = {};
  private order: number[] = [];
  private runners: Record<number, ClipJobRunner> = {};
  private working: number | null = null;
  private listeners = new Set<() => void>();
  private state: ClipQueueState = EMPTY;

  getState(): ClipQueueState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Queue a slot. A slot already waiting keeps its place with the new runner;
   * a slot mid-run is queued again after it so the newest state gets used. */
  enqueue(slotIndex: number, run: ClipJobRunner): void {
    this.runners[slotIndex] = run;
    const existing = this.jobs[slotIndex];
    if (existing?.status === 'queued') {
      this.emit();
      return;
    }
    if (existing?.status === 'working') {
      if (!this.order.includes(slotIndex)) this.order.push(slotIndex);
      this.emit();
      return;
    }
    this.jobs[slotIndex] = { slotIndex, status: 'queued', attempts: 0, error: null };
    if (!this.order.includes(slotIndex)) this.order.push(slotIndex);
    this.emit();
    void this.pump();
  }

  retry(slotIndex: number): void {
    const job = this.jobs[slotIndex];
    if (job === undefined || job.status !== 'failed') return;
    this.jobs[slotIndex] = { ...job, status: 'queued', attempts: 0, error: null };
    if (!this.order.includes(slotIndex)) this.order.push(slotIndex);
    this.emit();
    void this.pump();
  }

  /** Forget a slot (the creator re-recorded it before its job ran). */
  drop(slotIndex: number): void {
    if (this.jobs[slotIndex]?.status === 'working') return;
    delete this.jobs[slotIndex];
    delete this.runners[slotIndex];
    this.order = this.order.filter((s) => s !== slotIndex);
    this.emit();
  }

  private async pump(): Promise<void> {
    if (this.working !== null) return;
    const next = this.order.shift();
    if (next === undefined) {
      this.emit();
      return;
    }
    const run = this.runners[next];
    const job = this.jobs[next];
    if (run === undefined || job === undefined) {
      void this.pump();
      return;
    }
    this.working = next;
    this.jobs[next] = { ...job, status: 'working', attempts: job.attempts + 1 };
    this.emit();
    try {
      await run(next);
      this.jobs[next] = { ...this.jobs[next], status: 'done', error: null };
    } catch (e) {
      const failed = this.jobs[next];
      const message = e instanceof Error ? e.message : 'Upload failed';
      if (failed.attempts < MAX_ATTEMPTS) {
        this.jobs[next] = { ...failed, status: 'queued', error: message };
        this.order.unshift(next);
      } else {
        this.jobs[next] = { ...failed, status: 'failed', error: message };
      }
    } finally {
      this.working = null;
    }
    // A re-enqueue that landed while this slot was running stays in order.
    if (this.jobs[next].status === 'done' && this.order.includes(next)) {
      this.jobs[next] = { ...this.jobs[next], status: 'queued', attempts: 0 };
    }
    this.emit();
    void this.pump();
  }

  private emit(): void {
    const jobs = Object.values(this.jobs);
    const pending = [
      ...(this.working !== null ? [this.working] : []),
      ...this.order.filter((s) => s !== this.working),
    ];
    const failed = jobs.filter((j) => j.status === 'failed').map((j) => j.slotIndex);
    const idle = pending.length === 0;
    if (idle) {
      // Everything settled: the next batch counts from zero again.
      for (const j of jobs) {
        if (j.status === 'done') delete this.jobs[j.slotIndex];
      }
    }
    const remaining = Object.values(this.jobs);
    const done = idle ? 0 : remaining.filter((j) => j.status === 'done').length;
    const total = idle ? 0 : remaining.filter((j) => j.status !== 'failed').length;
    this.state = { jobs: { ...this.jobs }, pending, failed, done, total, idle };
    this.listeners.forEach((l) => l());
  }
}

const queues = new Map<string, ClipUploadQueue>();

/** One queue per submission (assignment or task id), kept for the app session. */
export function getClipUploadQueue(submissionKey: string): ClipUploadQueue {
  const existing = queues.get(submissionKey);
  if (existing !== undefined) return existing;
  const created = new ClipUploadQueue();
  queues.set(submissionKey, created);
  return created;
}

export function useClipUploadQueue(queue: ClipUploadQueue): ClipQueueState {
  return useSyncExternalStore(
    (listener) => queue.subscribe(listener),
    () => queue.getState(),
    () => queue.getState(),
  );
}

/** "Uploading 3 of 8" while work is in flight, null once idle. */
export function clipQueueLabel(state: ClipQueueState): string | null {
  if (state.idle || state.total === 0) return null;
  return `Uploading ${Math.min(state.done + 1, state.total)} of ${state.total}`;
}
