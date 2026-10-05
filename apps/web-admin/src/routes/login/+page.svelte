<script lang="ts">
  import { page } from '$app/state';
  import { api, ApiError } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { loginFlow } from '$lib/auth/flow.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { Countdown } from '$lib/utils/countdown.svelte';
  import { formatCountdown, formatNumber } from '$lib/utils/format';
  import { formatPhone, normalizePhone } from '$lib/utils/phone';
  import LogoMark from '$lib/components/ui/LogoMark.svelte';
  import PhoneField from '$lib/components/ui/PhoneField.svelte';
  import PasswordField from '$lib/components/ui/PasswordField.svelte';
  import OtpInput from '$lib/components/ui/OtpInput.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ResendCountdown from '$lib/components/ui/ResendCountdown.svelte';

  let mode = $state<'otp' | 'password'>('otp');
  let step = $state<'phone' | 'code'>('phone');
  let phone = $state('');
  let password = $state('');
  let code = $state('');
  let phoneError = $state<string | null>(null);
  let passError = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let codeError = $state<string | null>(null);
  let locked = $state<'exhausted' | 'expired' | null>(null);
  let loading = $state(false);
  /** AUTH_ACCOUNT_DISABLED: حساب غیرفعال/حذف‌شده است */
  let disabled = $state(false);
  let resetSignal = $state(0);
  const wait = new Countdown();
  const expiry = new Countdown();

  function reset() {
    phoneError = passError = formError = codeError = null;
    locked = null;
    disabled = false;
  }

  function handle(err: unknown, fallback: string) {
    if (err instanceof ApiError) {
      if (err.code === 'AUTH_ACCOUNT_DISABLED') {
        disabled = true;
        step = 'phone';
        loginFlow.clear();
      }
      if (err.code === 'RATE_LIMITED' && err.retryAfterSec) wait.start(err.retryAfterSec);
      return err.message;
    }
    return fallback;
  }

  async function sendOtp(e?: SubmitEvent) {
    e?.preventDefault();
    reset();
    const n = normalizePhone(phone);
    if (!n) {
      phoneError = 'شمارهٔ موبایل معتبر نیست؛ مثل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.';
      return;
    }
    loading = true;
    try {
      const ch = await api.auth.requestOtp(n);
      loginFlow.start(n, ch);
      expiry.start(ch.expiresInSec);
      code = '';
      step = 'code';
    } catch (err) {
      formError = handle(err, 'ارسال کد ممکن نشد. دوباره تلاش کنید.');
    } finally {
      loading = false;
    }
  }

  async function verify(value: string) {
    const ch = loginFlow.challenge;
    if (!ch || loading) return;
    loading = true;
    codeError = null;
    try {
      const r = await auth.verifyOtp(ch.challengeId, value);
      loginFlow.clear();
      auth.applyLogin(r);
      toasts.success('خوش آمدید!');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AUTH_ACCOUNT_DISABLED') {
        formError = handle(err, '');
      } else if (err instanceof ApiError) {
        if (err.code === 'AUTH_OTP_EXHAUSTED') locked = 'exhausted';
        else if (err.code === 'AUTH_OTP_EXPIRED') locked = 'expired';
        else if (err.code === 'AUTH_OTP_INVALID' && err.attemptsLeft !== undefined)
          codeError = `کد درست نیست. ${formatNumber(err.attemptsLeft)} تلاش دیگر دارید.`;
        else codeError = err.message;
      } else codeError = 'تأیید کد ممکن نشد.';
      resetSignal += 1;
    } finally {
      loading = false;
    }
  }

  async function resend() {
    if (!loginFlow.phone) return;
    loading = true;
    try {
      const ch = await api.auth.requestOtp(loginFlow.phone);
      loginFlow.replace(ch);
      expiry.start(ch.expiresInSec);
      locked = null;
      code = '';
      codeError = null;
      toasts.info('کد جدید ارسال شد.');
    } catch (err) {
      codeError = handle(err, 'ارسال مجدد ممکن نشد.');
    } finally {
      loading = false;
    }
  }

  async function loginPassword(e: SubmitEvent) {
    e.preventDefault();
    reset();
    const n = normalizePhone(phone);
    if (!n) phoneError = 'شمارهٔ موبایل معتبر نیست.';
    if (!password) passError = 'رمز عبور را وارد کنید.';
    if (!n || !password) return;
    loading = true;
    try {
      auth.applyLogin(await auth.loginPassword(n, password));
      toasts.success('خوش آمدید!');
    } catch (err) {
      formError = handle(err, 'ورود ممکن نشد. دوباره تلاش کنید.');
    } finally {
      loading = false;
    }
  }

  const switchMode = (m: 'otp' | 'password') => {
    mode = m;
    step = 'phone';
    reset();
  };
</script>

<svelte:head>
  <title>ورود به پنل مدیریت — اسراء</title>
</svelte:head>

<div class="wrap">
  <div class="brand"><LogoMark height={88} /></div>
  <div class="card">
    <div class="head">
      <h1>ورود به پنل مدیریت</h1>
      <p class="muted">فقط برای مدیران سیستم. با شمارهٔ موبایل خود وارد شوید.</p>
    </div>

    {#if auth.disabledNotice}
      <NoticeBanner tone="error" role="alert"><strong>حساب شما غیرفعال شده است.</strong> برای فعال‌سازی دوباره با مدیر سیستم تماس بگیرید.</NoticeBanner>
    {/if}
    {#if auth.expiredNotice}
      <NoticeBanner tone="warning" role="alert">نشست شما پایان یافته است؛ دوباره وارد شوید.</NoticeBanner>
    {/if}

    {#if step === 'phone'}
      <div class="modes" role="tablist" aria-label="روش ورود">
        <button type="button" role="tab" aria-selected={mode === 'otp'} class:on={mode === 'otp'} onclick={() => switchMode('otp')}>کد پیامکی</button>
        <button type="button" role="tab" aria-selected={mode === 'password'} class:on={mode === 'password'} onclick={() => switchMode('password')}>رمز عبور</button>
      </div>

      <form onsubmit={mode === 'otp' ? sendOtp : loginPassword} novalidate class="form">
        <PhoneField bind:value={phone} error={phoneError} disabled={loading} />
        {#if mode === 'password'}<PasswordField bind:value={password} error={passError} disabled={loading} />{/if}

        {#if disabled}
          <NoticeBanner tone="error" role="alert"><strong>حساب شما غیرفعال شده است.</strong> نمی‌توانید وارد شوید؛ برای فعال‌سازی دوباره با مدیر سیستم تماس بگیرید.</NoticeBanner>
        {:else if formError}
          <NoticeBanner tone="error" role="alert">
            {formError}{#if wait.remaining > 0}<strong> ({formatCountdown(wait.remaining)})</strong>{/if}
          </NoticeBanner>
        {/if}

        <Button type="submit" {loading} disabled={wait.remaining > 0} full>{mode === 'otp' ? 'دریافت کد تأیید' : 'ورود'}</Button>
      </form>
    {:else if loginFlow.phone && loginFlow.challenge}
      <p class="muted">
        کد ۵ رقمی به شمارهٔ <bdi dir="ltr" class="num">{formatPhone(loginFlow.phone)}</bdi> پیامک شد.
        <button type="button" class="link" onclick={() => (step = 'phone')}>تغییر شماره</button>
      </p>

      {#if locked}
        <NoticeBanner tone="warning" role="alert">
          {locked === 'exhausted' ? 'تعداد تلاش‌های مجاز تمام شد.' : 'مهلت کد به پایان رسید.'} کد جدید دریافت کنید.
        </NoticeBanner>
        <Button {loading} onclick={resend} full>دریافت کد جدید</Button>
      {:else}
        <div class="otp">
          <OtpInput bind:value={code} oncomplete={verify} invalid={!!codeError} disabled={loading} {resetSignal} />
          {#if codeError}<p class="err" role="alert">{codeError}</p>{/if}
          <p class="muted small center">
            {#if expiry.remaining > 0}کد تا <strong>{formatCountdown(expiry.remaining)}</strong> دیگر معتبر است.{:else}کد منقضی شده است؛ کد جدید بگیرید.{/if}
          </p>
        </div>
        <Button {loading} disabled={code.length < 5} onclick={() => verify(code)} full>تأیید و ورود</Button>
        <div class="row">
          <ResendCountdown seconds={loginFlow.challenge.resendAfterSec} token={loginFlow.issuedAt} busy={loading} onresend={resend} />
        </div>
      {/if}
    {/if}
  </div>
  <p class="muted foot">دسترسی به این پنل ثبت و پایش می‌شود.</p>
</div>

<style>
  .wrap {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--space-lg);
    min-height: 100dvh;
    padding: var(--space-lg) var(--gutter);
    background: linear-gradient(to bottom, var(--color-surface), var(--color-neutral));
  }
  .card {
    display: grid;
    gap: var(--space-lg);
    width: min(100%, 28rem);
    padding: var(--space-xl) var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
    box-shadow: var(--elev-2);
  }
  .head {
    display: grid;
    gap: var(--space-xs);
  }
  h1 {
    font-size: var(--fs-xl);
  }
  .modes {
    display: flex;
    gap: var(--space-xs);
    padding: 4px;
    background: var(--color-neutral);
    border-radius: var(--radius-md);
  }
  .modes button {
    flex: 1;
    min-height: 44px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted);
    font-weight: 700;
  }
  .modes button.on {
    background: var(--color-card);
    color: var(--color-primary);
    box-shadow: var(--elev-1);
  }
  .form,
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
  .link {
    border: 0;
    background: transparent;
    color: var(--color-accent);
    font-weight: 700;
    text-decoration: underline;
    padding: 0;
  }
  .foot {
    font-size: var(--fs-xs);
  }
</style>
