import type { OtpChallenge } from '$lib/api';

/** وضعیت موقت مرحلهٔ ورود با OTP (فقط حافظه) */
class LoginFlow {
  phone = $state<string | null>(null);
  challenge = $state<OtpChallenge | null>(null);
  issuedAt = $state(0);

  start(phone: string, challenge: OtpChallenge) {
    this.phone = phone;
    this.challenge = challenge;
    this.issuedAt = Date.now();
  }
  replace(challenge: OtpChallenge) {
    this.challenge = challenge;
    this.issuedAt = Date.now();
  }
  clear() {
    this.phone = null;
    this.challenge = null;
  }
}

export const loginFlow = new LoginFlow();
