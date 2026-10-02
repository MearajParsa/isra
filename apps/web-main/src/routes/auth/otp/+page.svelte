<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { ApiError } from '$lib/api/types';
  import { auth } from '$lib/auth/auth.svelte';
  import { authFlow } from '$lib/auth/flow.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { Countdown } from '$lib/utils/countdown.svelte';
  import { formatCountdown, formatNumber } from '$lib/utils/format';
  import { formatPhone } from '$lib/utils/phone';
  import { safeNext } from '$lib/utils/nav';
  import OtpInput from '$lib/components/ui/OtpInput.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ResendCountdown from '$lib/components/ui/ResendCountdown.svelte';

  let code = $state('');
  let verifying = $state(false);
  let resending = $state(false);
  let error = $state<string | null>(null);
  let locked = $state<'exhausted' | 'expired' | null>(null);
  let resetSignal = $state(0);
  const expiry = new Countdown();

  const phone = $derived(authFlow.phone);
  const challenge = $derived(authFlow.challenge);
  const changeHref = $derived(authFlow.purpose === 'reset' ? '/auth/forgot' : '/auth/phone');

  onMount(() => {
    if (!authFlow.challenge || !authFlow.phone) {
      void goto('/auth/phone', { replaceState: true });
      return;
    }
    const elapsed = Math.floor((Date.now() - authFlow.issuedAt) / 1000);
    expiry.start(Math.max(0, authFlow.challenge.expiresInSec - elapsed));
  });

  async function verify(value: string) {
    if (!challenge || verifying) return;
    verifying = true;
    error = null;
    try {
      const result = await auth.verifyOtp(challenge.challengeId, value);
      await auth.applyLogin(result, true);
      const purpose = authFlow.purpose;
      const next = safeNext(authFlow.next);
      if (!result.user.profileComplete) {
        await goto(`/auth/onboarding${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`, { replaceState: true });
      } else if (purpose === 'reset') {
        await goto('/account/password?reset=1', { replaceState: true });
      } else {
        toasts.success('خوش آمدید!');
        await goto(next, { replaceState: true });
      }
      authFlow.clear();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'AUTH_OTP_EXHAUSTED') locked = 'exhausted';
        else if (e.code === 'AUTH_OTP_EXPIRED') locked = 'expired';
        else if (e.code === 'AUTH_OTP_INVALID') {
          const left = e.attemptsLeft;
          error = left !== undefined ? `کد درست نیست. ${formatNumber(left)} تلاش دیگر دارید.` : e.message;
        } else error = e.message;
      } else error = 'تأیید کد ممکن نشد. دوباره تلاش کنید.';
      resetSignal += 1;
    } finally {
      verifying = false;
    }
  }

  async function resend() {
    if (!phone) return;
    resending = true;
    error = null;
    try {
      const c = await api.auth.requestOtp(phone);
      authFlow.replaceChallenge(c);
      code = '';
      locked = null;
      expiry.start(c.expiresInSec);
      toasts.info('کد جدید ارسال شد.');
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'ارسال مجدد ممکن نشد.';
    } finally {
      resending = false;
    }
  }
</script>

<svelte:head>
  <title>کد تأیید — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if phone && challenge}
  <div class="head">
    <h1>کد تأیید را وارد کنید</h1>
    <p class="muted">
      کد ۵ رقمی به شمارهٔ <bdi dir="ltr" class="num">{formatPhone(phone)}</bdi> پیامک شد.
      <a href={changeHref}>تغییر شماره</a>
    </p>
  </div>

  {#if locked}
    <NoticeBanner tone="warning" role="alert">
      {locked === 'exhausted' ? 'تعداد تلاش‌های مجاز تمام شد.' : 'مهلت کد به پایان رسید.'} برای ادامه کد جدید دریافت کنید.
    </NoticeBanner>
    <Button loading={resending} onclick={resend} full>دریافت کد جدید</Button>
  {:else}
    <div class="otp">
      <OtpInput bind:value={code} oncomplete={verify} invalid={!!error} disabled={verifying} {resetSignal} />
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <p class="muted small center">
        {#if expiry.remaining > 0}کد تا <strong>{formatCountdown(expiry.remaining)}</strong> دیگر معتبر است.{:else}کد منقضی شده است؛ کد جدید بگیرید.{/if}
      </p>
    </div>

    <Button loading={verifying} disabled={code.length < 5} onclick={() => verify(code)} full>تأیید و ادامه</Button>

    <div class="row">
      <ResendCountdown seconds={challenge.resendAfterSec} token={authFlow.issuedAt} busy={resending} onresend={resend} />
    </div>
  {/if}
{/if}

<style>
  .head {
    display: grid;
    gap: var(--space-xs);
  }
  .otp {
    display: grid;
    gap: var(--space-md);
  }
  .err {
    color: var(--color-error);
    text-align: center;
    font-size: var(--fs-sm);
  }
  .small {
    font-size: var(--fs-sm);
  }
  .center {
    text-align: center;
  }
  .row {
    display: flex;
    justify-content: center;
  }
  .num {
    font-weight: 700;
  }
</style>
