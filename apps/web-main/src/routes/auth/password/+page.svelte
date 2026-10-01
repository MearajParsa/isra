<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ApiError } from '$lib/api/types';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { normalizePhone } from '$lib/utils/phone';
  import { safeNext } from '$lib/utils/nav';
  import { Countdown } from '$lib/utils/countdown.svelte';
  import { formatCountdown } from '$lib/utils/format';
  import PhoneField from '$lib/components/ui/PhoneField.svelte';
  import PasswordField from '$lib/components/ui/PasswordField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';

  const nextParam = $derived(page.url.searchParams.get('next'));
  const next = $derived(nextParam ? safeNext(nextParam) : null);
  const qs = $derived(next ? `?next=${encodeURIComponent(next)}` : '');

  let phone = $state('');
  let password = $state('');
  let phoneError = $state<string | null>(null);
  let passError = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let loading = $state(false);
  let suggestOtp = $state(false);
  const wait = new Countdown();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    phoneError = passError = formError = null;
    suggestOtp = false;
    const normalized = normalizePhone(phone);
    if (!normalized) phoneError = 'شمارهٔ موبایل معتبر نیست.';
    if (!password) passError = 'رمز عبور را وارد کنید.';
    if (phoneError || passError || !normalized) return;

    loading = true;
    try {
      const result = await auth.loginPassword(normalized, password);
      await auth.applyLogin(result, false);
      const target = safeNext(next);
      if (!result.user.profileComplete) {
        await goto(`/auth/onboarding${qs}`, { replaceState: true });
      } else {
        toasts.success('خوش آمدید!');
        await goto(target, { replaceState: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'RATE_LIMITED' && err.retryAfterSec) wait.start(err.retryAfterSec);
        if (err.code === 'AUTH_INVALID_CREDENTIALS') suggestOtp = true;
        formError = err.message;
      } else formError = 'ورود ممکن نشد. دوباره تلاش کنید.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>ورود با رمز عبور — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="head">
  <h1>ورود با رمز عبور</h1>
  <p class="muted">شمارهٔ موبایل و رمز عبور خود را وارد کنید.</p>
</div>

<form onsubmit={submit} novalidate class="form">
  <PhoneField bind:value={phone} error={phoneError} disabled={loading} />
  <PasswordField bind:value={password} error={passError} disabled={loading} />

  {#if formError}
    <NoticeBanner tone="error" role="alert">
      {formError}
      {#if wait.remaining > 0}<strong> ({formatCountdown(wait.remaining)})</strong>{/if}
    </NoticeBanner>
  {/if}

  <Button type="submit" {loading} disabled={wait.remaining > 0} full>ورود</Button>
</form>

<div class="alt">
  <a href={`/auth/phone${qs}`}>{suggestOtp ? 'به‌جای رمز، با کد پیامکی وارد شوید' : 'ورود با کد پیامکی'}</a>
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
