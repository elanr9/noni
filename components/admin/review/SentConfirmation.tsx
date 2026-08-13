import { ConfirmationTakeover } from '../shared';

export interface SentConfirmationProps {
  /** Creator first name, e.g. "Fabri". */
  creatorShort: string;
  onNext: () => void;
}

/** Admin handoff §3 sent back takeover — only the noted sections go back. */
export function SentConfirmation({ creatorShort, onNext }: SentConfirmationProps) {
  return (
    <ConfirmationTakeover
      icon="send"
      tone="brand"
      title="Sent back"
      body={`${creatorShort} gets this post back with your notes on the sections you marked. Nothing else has to be re-recorded.`}
      actionLabel="Next in queue"
      onAction={onNext}
      onBack={onNext}
    />
  );
}
