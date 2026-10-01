/** شمارندهٔ معکوس مبتنی بر زمان واقعی (در برابر tab پس‌زمینه دقیق می‌ماند) */
export class Countdown {
  remaining = $state(0);
  #until = 0;
  #timer: ReturnType<typeof setInterval> | null = null;

  start(seconds: number) {
    this.stop();
    this.#until = Date.now() + seconds * 1000;
    this.#tick();
    this.#timer = setInterval(() => this.#tick(), 250);
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  #tick() {
    const left = Math.max(0, Math.ceil((this.#until - Date.now()) / 1000));
    if (left !== this.remaining) this.remaining = left;
    if (left === 0) this.stop();
  }
}
