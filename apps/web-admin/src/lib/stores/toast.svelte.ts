export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

class ToastStore {
  items = $state<Toast[]>([]);
  #seq = 0;

  push(kind: ToastKind, message: string, ms = 4200) {
    const id = ++this.#seq;
    this.items = [...this.items, { id, kind, message }];
    setTimeout(() => this.dismiss(id), ms);
  }
  success(message: string) {
    this.push('success', message);
  }
  error(message: string) {
    this.push('error', message, 6000);
  }
  info(message: string) {
    this.push('info', message);
  }
  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new ToastStore();
