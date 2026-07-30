import type { Database } from './types';

export type TaskStatus =
  | 'assigned'
  | 'recorded'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'posted';

export type ContentTask = Database['public']['Tables']['content_tasks']['Row'] & {
  status: TaskStatus;
};

const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  assigned: ['recorded'],
  recorded: ['submitted'],
  submitted: ['changes_requested', 'approved'],
  changes_requested: ['recorded'],
  approved: ['posted'],
  posted: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task transition: ${from} → ${to}`);
  }
}

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'assigned':
      return 'To do';
    case 'recorded':
      return 'Recorded';
    case 'submitted':
      return 'In review';
    case 'changes_requested':
      return 'Changes needed';
    case 'approved':
      return 'Approved';
    case 'posted':
      return 'Posted';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function statusColor(status: TaskStatus): string {
  switch (status) {
    case 'assigned':
      return '#E85D04';
    case 'recorded':
      return '#0B6E99';
    case 'submitted':
      return '#5C5C66';
    case 'changes_requested':
      return '#C1121F';
    case 'approved':
      return '#2D6A4F';
    case 'posted':
      return '#1B4332';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Creator-side transitions only. Admin approve/post live in admin packages. */
export function nextCreatorAction(
  status: TaskStatus,
): { to: TaskStatus; label: string } | null {
  switch (status) {
    case 'assigned':
    case 'changes_requested':
      return { to: 'recorded', label: 'Mark recorded' };
    case 'recorded':
      return { to: 'submitted', label: 'Send for review' };
    default:
      return null;
  }
}
