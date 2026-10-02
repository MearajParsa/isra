class NetStore {
  online = $state(true);

  start(): () => void {
    this.online = navigator.onLine;
    const on = () => (this.online = true);
    const off = () => (this.online = false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }
}

export const net = new NetStore();
