export type SyncPassResult = "idle" | "more";

/** One writer, with wakeups coalesced across local edits and cloud updates. */
export class SyncWorker {
  private enabled = false;
  private running = false;
  private requested = false;
  private generation = 0;
  private failures = 0;
  private retryAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly drain: (
      canContinue: () => boolean,
    ) => Promise<SyncPassResult>,
    private readonly onError: (error: unknown) => void,
  ) {}

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.generation++;
    if (!enabled) {
      clearTimeout(this.timer);
      this.timer = undefined;
    } else {
      this.wake();
    }
  }

  wake() {
    this.requested = true;
    this.schedule();
  }

  private schedule() {
    if (!this.enabled || this.running || this.timer || !this.requested) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.run();
      },
      Math.max(0, this.retryAt - Date.now()),
    );
  }

  private async run() {
    if (!this.enabled || this.running) return;
    this.running = true;
    this.requested = false;
    const generation = this.generation;
    const canContinue = () => this.enabled && generation === this.generation;
    try {
      const result = await this.drain(canContinue);
      if (canContinue()) {
        this.failures = 0;
        this.retryAt = 0;
        if (result === "more") this.requested = true;
      }
    } catch (error) {
      // No local/cloud wakeup can bypass this cooldown. The durable outbox
      // keeps its original operation id until local acknowledgment succeeds.
      this.failures++;
      const delay = Math.min(
        60_000,
        2_000 * 2 ** Math.min(this.failures - 1, 5),
      );
      this.retryAt =
        Date.now() +
        Math.min(60_000, delay + Math.floor(Math.random() * delay * 0.2));
      this.requested = true;
      this.onError(error);
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}
