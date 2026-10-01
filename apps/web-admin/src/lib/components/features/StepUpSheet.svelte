<script lang="ts">
  import { api, ApiError, type OtpChallenge } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { stepUp } from '$lib/stores/stepup.svelte';
  import { Countdown } from '$lib/utils/countdown.svelte';
  import { formatCountdown, formatNumber } from '$lib/utils/format';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import OtpInput from '$lib/components/ui/OtpInput.svelte';
  import ResendCountdown from '$lib/components/ui/ResendCountdown.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';

  let open = $state(false);
  let challenge = $state<OtpChallenge | null>(null);
  let code = $state('');
  let sending = $state(false);
  let verifying = $state(false);
  let error = $state<string | null>(null);
  let exhausted = $state(false);
  let expired = $state(false);
  let resetSignal = $state(0);
  let issued = $state(0);
  const expiry = new Countdown();

  $effect(() => {
    if (stepUp.isOpen && !open) {
      open = true;
      void send();
    } else if (!stepUp.isOpen && open) {
      open = false;
    }
  });

  function onclose() {
    stepUp.done(null);
  }

  async function send() {
    sending = true;
    error = null;
    exhausted = false;
    expired = false;
    code = '';
    try {
      challenge = await auth.withAuth((t) => api.auth.stepUpRequest(t));
      issued += 1;
      expiry.start(challenge.expiresInSec);
    } catch (e) {
      challenge = null;
      error = e instanceof ApiError ? e.message : 'ارسال کد ممکن نشد.';
    } finally {
      sending = false;
    }
  }

  async function verify(value: string) {
    if (!challenge || verifying) return;
    verifying = true;
    error = null;
    try {
      const res = await auth.withAuth((t) =>
        api.auth.stepUpVerify(t, { challengeId: challenge!.challengeId, code: value })
      );
      stepUp.done(res.stepUpToken, res.expiresInSec);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'AUTH_OTP_EXHAUSTED') exhausted = true;
        else if (e.code === 'AUTH_OTP_EXPIRED') expired = true;
        else if (e.code === 'AUTH_OTP_INVALID') {
          const left = e.attemptsLeft;
          error = left !== undefined ? `کد درست نیست. ${formatNumber(left)} تلاش دیگر دارید.` : e.message;
        } else error = e.message;
      } else error = 'تأیید کد ممکن نشد.';
      resetSignal += 1;
    } finally {
      verifying = false;
    }
  }
</script>

<Sheet bind:open title="تأیید هویت" dismissible={!verifying} {onclose}>
  <p class="muted">برای حفظ امنیت حساب، کدی به شمارهٔ {system.me?.user.phone ?? 'شما'} پیامک می‌شود.</p>

  {#if sending}
    <p class="center muted">در حال ارسال کد…</p>
  {:else if exhausted || expired}
    <NoticeBanner tone="warning" role="alert">
      {exhausted ? 'تعداد تلاش‌ها تمام شد.' : 'کد منقضی شده است.'} کد جدید دریافت کنید.
    </NoticeBanner>
    <Button onclick={send} full>ارسال کد جدید</Button>
  {:else if challenge}
    <OtpInput bind:value={code} oncomplete={verify} invalid={!!error} disabled={verifying} {resetSignal} />
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <p class="muted center small">
      {#if expiry.remaining > 0}کد تا {formatCountdown(expiry.remaining)} دیگر معتبر است.{:else}کد منقضی شد.{/if}
    </p>
    <div class="row">
      <ResendCountdown seconds={challenge.resendAfterSec} token={issued} busy={sending} onresend={send} />
    </div>
  {:else if error}
    <NoticeBanner tone="error" role="alert">{error}</NoticeBanner>
    <Button onclick={send} full>تلاش دوباره</Button>
  {/if}
</Sheet>

<style>
  .center {
    text-align: center;
  }
  .row {
    display: flex;
    justify-content: center;
  }
  .small {
    font-size: var(--fs-sm);
  }
  .err {
    color: var(--color-error);
    text-align: center;
    font-size: var(--fs-sm);
  }
</style>
