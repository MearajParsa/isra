/** low_auth_gate: sheet دعوت به ورود برای اقدام‌های نیازمند حساب */
class GateStore {
  isOpen = $state(false);
  reason = $state('برای ادامه، وارد حساب خود شوید.');
  next = $state<string | null>(null);

  open(reason?: string, next?: string) {
    if (reason) this.reason = reason;
    this.next = next ?? null;
    this.isOpen = true;
  }
  close() {
    this.isOpen = false;
  }
}

export const gate = new GateStore();
