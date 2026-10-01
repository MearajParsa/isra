interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'isra.pwa.dismissedAt';
const DISMISS_DAYS = 14;

class PwaStore {
  #event: BeforeInstallPromptEvent | null = null;
  canPrompt = $state(false);
  isIos = $state(false);
  standalone = $state(false);
  dismissed = $state(true);

  start(): () => void {
    const ua = navigator.userAgent;
    this.isIos = /iPhone|iPad|iPod/.test(ua);
    this.standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      this.dismissed = at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
    } catch {
      this.dismissed = false;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      this.#event = e as BeforeInstallPromptEvent;
      this.canPrompt = true;
    };
    const onInstalled = () => {
      this.standalone = true;
      this.canPrompt = false;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }

  /** نوار نصب نمایش داده شود؟ (Chromium با prompt یا iOS با راهنما) */
  get visible(): boolean {
    return !this.standalone && !this.dismissed && (this.canPrompt || this.isIos);
  }

  async install(): Promise<void> {
    if (!this.#event) return;
    await this.#event.prompt();
    const { outcome } = await this.#event.userChoice;
    this.#event = null;
    this.canPrompt = false;
    if (outcome === 'dismissed') this.dismiss();
  }

  dismiss() {
    this.dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
}

export const pwa = new PwaStore();
