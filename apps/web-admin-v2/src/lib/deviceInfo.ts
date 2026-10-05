/**
 * Device Identification Utilities
 */

const DEVICE_ID_KEY = 'isra.admin.device_id';

/**
 * Returns a persistent UUID for this browser device.
 * Generated once and persisted in localStorage.
 */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : generateFallbackUuid();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return '00000000-0000-4000-8000-000000000000';
  }
}

function generateFallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Detects browser and operating system to create a friendly device label (max 80 chars)
 */
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'مرورگر وب';

  const ua = navigator.userAgent;
  let browser = 'مرورگر وب';
  let os = 'رایانه';

  // Detect OS
  if (/Windows NT/i.test(ua)) os = 'ویندوز';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'مک‌اواس';
  else if (/Android/i.test(ua)) os = 'اندروید';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'آی‌اواس';
  else if (/Linux/i.test(ua)) os = 'لینوکس';

  // Detect Browser
  if (/Edg\//i.test(ua)) browser = 'مایکروسافت اج';
  else if (/Chrome\//i.test(ua)) browser = 'گوگل کروم';
  else if (/Firefox\//i.test(ua)) browser = 'موزیلا فایرفاکس';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'سافاری';

  const label = `${browser} (${os})`;
  return label.slice(0, 80);
}
