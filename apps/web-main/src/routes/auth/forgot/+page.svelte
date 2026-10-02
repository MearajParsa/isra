<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import { ApiError } from '$lib/api/types';
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

  let phone = $state('');
  let fieldError = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let loading = $state(false);
  const wait = new Countdown();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    fieldError = formError = null;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      fieldError = 'شمارهٔ موبایل معتبر نیست؛ مثل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.';
      return;
    }
    loading = true;
    try {
      const challenge = await api.auth.requestOtp(normalized);
      authFlow.start(normalized, challenge, 'reset', next);
      await goto('/auth/otp');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'RATE_LIMITED' && err.retryAfterSec) wait.start(err.retryAfterSec);
        formError = err.message;
      } else formError = 'ارسال کد ممکن نشد. دوباره تلاش کنید.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>فراموشی رمز عبور — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="head">
  <h1>فراموشی رمز عبور</h1>
  <p class="muted">
    کد تأیید به شمارهٔ شما پیامک می‌شود. پس از ورود با کد، می‌توانید رمز جدید تعیین کنید.
  </p>
</div>

<form onsubmit={submit} novalidate class="form">
  <PhoneField bind:value={phone} error={fieldError} disabled={loading} />

  {#if formError}
    <NoticeBanner tone="error" role="alert">
      {formError}
      {#if wait.remaining > 0}<strong> ({formatCountdown(wait.remaining)})</strong>{/if}
    </NoticeBanner>
  {/if}

  <Button type="submit" {loading} disabled={wait.remaining > 0} full>ارسال کد تأیید</Button>
</form>

<a class="back" href="/auth/password">بازگشت به ورود با رمز</a>

<style>
  .head {
    display: grid;
    gap: var(--space-xs);
  }
  .form {
    display: grid;
    gap: var(--space-md);
  }
  .back {
    font-size: var(--fs-sm);
    font-weight: 700;
  }
</style>
