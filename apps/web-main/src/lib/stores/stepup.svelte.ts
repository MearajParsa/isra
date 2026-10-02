/** low_stepup_sheet: درخواست تأیید مجدد هویت؛ نتیجه = stepUpToken یا null (انصراف) */
class StepUpStore {
  isOpen = $state(false);
  #resolve: ((token: string | null) => void) | null = null;

  request(): Promise<string | null> {
    this.isOpen = true;
    return new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }
  done(token: string | null) {
    this.isOpen = false;
    this.#resolve?.(token);
    this.#resolve = null;
  }
}

export const stepUp = new StepUpStore();
