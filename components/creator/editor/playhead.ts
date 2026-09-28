// Frame rate playhead position shared by the stage and the timeline without
// going through React state. Subscribers (the timeline scroll) run
// imperatively on every tick; the editor mirrors the value into state at a
// low rate for labels only.
export type PlayheadListener = (ms: number) => void;

export class Playhead {
  private ms = 0;
  private readonly listeners = new Set<PlayheadListener>();

  get(): number {
    return this.ms;
  }

  set(ms: number): void {
    if (ms === this.ms) return;
    this.ms = ms;
    this.listeners.forEach((listener) => listener(ms));
  }

  subscribe(listener: PlayheadListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
