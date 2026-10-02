/** تأیید مجدد هویت: توکن step-up تا انقضا نگه داشته می‌شود تا هر write سؤال نپرسد */
class StepUpStore {
  isOpen = $state(false);
  #resolve: ((token: string | null) => void) | null = null;
  #token: string | null = null;
  #exp = 0;

  get cached(): string | null {
    return this.#token && Date.now() < this.#exp ? this.#token : null;
  }

  async ensure(): Promise<string | null> {
    return this.cached ?? this.request();
  }

  request(): Promise<string | null> {
    this.isOpen = true;
    return new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  done(token: string | null, expiresInSec = 0) {
    this.isOpen = false;
    if (token) {
      this.#token = token;
      this.#exp = Date.now() + Math.max(0, expiresInSec - 10) * 1000;
    }
    this.#resolve?.(token);
    this.#resolve = null;
  }

  clear() {
    this.#token = null;
    this.#exp = 0;
  }
}

export const stepUp = new StepUpStore();
