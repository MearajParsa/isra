import type { OtpChallenge } from '$lib/api/types';

export type OtpPurpose = 'login' | 'reset';

/** وضعیت موقت مسیر phone → otp (فقط در حافظه؛ با reload خالی می‌شود) */
class AuthFlow {
  phone = $state<string | null>(null);
  challenge = $state<OtpChallenge | null>(null);
  issuedAt = $state(0);
  purpose = $state<OtpPurpose>('login');
  next = $state<string | null>(null);

  start(phone: string, challenge: OtpChallenge, purpose: OtpPurpose, next: string | null) {
    this.phone = phone;
    this.challenge = challenge;
    this.issuedAt = Date.now();
    this.purpose = purpose;
    this.next = next;
  }
  replaceChallenge(challenge: OtpChallenge) {
    this.challenge = challenge;
    this.issuedAt = Date.now();
  }
  clear() {
    this.phone = null;
    this.challenge = null;
    this.next = null;
  }
}

export const authFlow = new AuthFlow();
