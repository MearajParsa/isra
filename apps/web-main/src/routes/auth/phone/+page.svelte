<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import { ApiError } from '$lib/api/types';
  import { auth } from '$lib/auth/auth.svelte';
  import { authFlow } from '$lib/auth/flow.svelte';
  import { normalizePhone } from '$lib/utils/phone';
  import { safeNext } from '$lib/utils/nav';
  import { Countdown } from '$lib/utils/countdown.svelte';
  import { formatCountdown } from '$lib/utils/format';
  import PhoneField from '$lib/components/ui/PhoneField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';

  const nextParam = $derived(page.url.searchParams.get('next'));
  const next = $derived(nextParam ? safeNext(nextParam) : null);
  const qs = $derived(next ? `?next=${encodeURIComponent(next)}` : '');

  let phone = $state('');
  let fieldError = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let loading = $state(false);
  const wait = new Countdown();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    fieldError = null;
    formError = null;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      fieldError = 'شمارهٔ موبایل معتبر نیست؛ مثل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.';
      return;
    }
    loading = true;
    try {
      const challenge = await api.auth.requestOtp(normalized);
      authFlow.start(normalized, challenge, 'login', next);
      await goto('/auth/otp');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'RATE_LIMITED' && err.retryAfterSec) wait.start(err.retryAfterSec);
        if (err.code === 'VALIDATION_FAILED') fieldError = (err.details.fields as Record<string, string> | undefined)?.phone ?? err.message;
        else formError = err.message;
      } else formError = 'ارسال کد ممکن نشد. دوباره تلاش کنید.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>ورود یا ثبت‌نام — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="head">
  <h1>ورود یا ثبت‌نام</h1>
  <p class="muted">شمارهٔ موبایل خود را وارد کنید تا کد تأیید برایتان پیامک شود.</p>
</div>

{#if auth.expiredNotice}
  <NoticeBanner tone="warning" role="alert">نشست شما پایان یافته است؛ دوباره وارد شوید.</NoticeBanner>
{/if}

<form onsubmit={submit} novalidate class="form">
  <PhoneField bind:value={phone} error={fieldError} disabled={loading} />

  {#if formError}
    <NoticeBanner tone="error" role="alert">
      {formError}
      {#if wait.remaining > 0}<strong> ({formatCountdown(wait.remaining)})</strong>{/if}
    </NoticeBanner>
  {/if}

  <Button type="submit" {loading} disabled={wait.remaining > 0} full>
    {wait.remaining > 0 ? `صبر کنید (${formatCountdown(wait.remaining)})` : 'دریافت کد تأیید'}
  </Button>
</form>

<div class="alt">
  <a href={`/auth/password${qs}`}>ورود با رمز عبور</a>
  <a href={`/auth/forgot${qs}`}>رمز را فراموش کرده‌ام</a>
</div>

<style>
  .head {
    display: grid;
    gap: var(--space-xs);
  }
  .form {
    display: grid;
    gap: var(--space-md);
  }
  .alt {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-sm);
    font-size: var(--fs-sm);
    font-weight: 700;
  }
</style>
