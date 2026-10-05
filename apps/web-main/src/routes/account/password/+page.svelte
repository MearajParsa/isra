<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import { ApiError } from '$lib/api/types';
  import { auth } from '$lib/auth/auth.svelte';
  import { stepUp } from '$lib/stores/stepup.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import PasswordField from '$lib/components/ui/PasswordField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';

  const isReset = $derived(page.url.searchParams.get('reset') === '1');
  /** رمز موقتِ تعیین‌شده توسط مدیر: به‌جای step-up، رمز موقت (currentPassword) لازم است */
  const isTemp = $derived(auth.mustChangePassword || (auth.status === 'unknown' && page.url.searchParams.get('temp') === '1'));
  const hasPassword = $derived(auth.me?.hasPassword ?? false);
  const title = $derived(isTemp || isReset ? 'تعیین رمز جدید' : hasPassword ? 'تغییر رمز عبور' : 'تعیین رمز عبور');

  let current = $state('');
  let password = $state('');
  let confirm = $state('');
  let errors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);
  let loading = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    formError = null;
    if (isTemp && !current) errors.currentPassword = 'رمز موقت را وارد کنید.';
    if (password.length < 8) errors.newPassword = 'رمز عبور دست‌کم ۸ نویسه باشد.';
    if (confirm !== password) errors.confirm = 'تکرار رمز با رمز واردشده یکسان نیست.';
    if (Object.keys(errors).length) return;

    loading = true;
    try {
      if (isTemp) {
        await auth.withAuth((t) => api.me.setPassword(t, { newPassword: password, currentPassword: current }));
        await auth.completePasswordChange();
        toasts.success('رمز جدید ذخیره شد. از دستگاه‌های دیگر خارج شدید.');
        await goto('/account', { replaceState: true });
        return;
      }
      // ورود تازه با OTP (کمتر از ۵ دقیقه) نیاز به تأیید دوباره ندارد
      let token: string | undefined;
      if (!auth.hasFreshOtp) {
        const t = await stepUp.request();
        if (!t) return;
        token = t;
      }
      try {
        await auth.withAuth((t) => api.me.setPassword(t, { newPassword: password, stepUpToken: token }));
      } catch (err) {
        if (err instanceof ApiError && err.code === 'AUTH_STEP_UP_REQUIRED' && !token) {
          const t = await stepUp.request();
          if (!t) return;
          await auth.withAuth((tk) => api.me.setPassword(tk, { newPassword: password, stepUpToken: t }));
        } else throw err;
      }
      auth.markHasPassword();
      toasts.success('رمز عبور ذخیره شد. از دستگاه‌های دیگر خارج شدید.');
      await goto('/account', { replaceState: true });
    } catch (err) {
      if (isTemp && err instanceof ApiError && err.code === 'AUTH_INVALID_CREDENTIALS') {
        errors = { currentPassword: 'رمز موقت درست نیست.' };
        return;
      }
      errors = fieldErrors(err);
      if (Object.keys(errors).length === 0) formError = errorMessage(err);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{title} — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHeader {title} backHref={isTemp ? undefined : '/account'} />

<form onsubmit={submit} novalidate class="form">
  {#if isTemp}
    <NoticeBanner tone="warning">رمز شما را مدیر سیستم موقتاً تعیین کرده است. برای ادامه، رمز موقت را وارد و رمز دلخواه خود را بسازید.</NoticeBanner>
    <PasswordField label="رمز موقت فعلی" bind:value={current} autocomplete="current-password" error={errors.currentPassword} disabled={loading} />
  {:else if isReset}
    <NoticeBanner tone="success">با کد پیامکی وارد شدید؛ اکنون رمز جدید خود را تعیین کنید.</NoticeBanner>
  {:else}
    <NoticeBanner tone="info">
      برای امنیت حساب، پیش از ذخیرهٔ رمز، کد تأیید به شمارهٔ شما پیامک می‌شود. با ذخیرهٔ رمز، از بقیهٔ دستگاه‌ها خارج می‌شوید.
    </NoticeBanner>
  {/if}

  <PasswordField
    label={hasPassword || isReset || isTemp ? 'رمز جدید' : 'رمز عبور'}
    bind:value={password}
    autocomplete="new-password"
    error={errors.newPassword}
    hint="دست‌کم ۸ نویسه."
    disabled={loading}
  />
  <PasswordField label="تکرار رمز" bind:value={confirm} autocomplete="new-password" error={errors.confirm} disabled={loading} />

  {#if formError}<NoticeBanner tone="error" role="alert">{formError}</NoticeBanner>{/if}

  <div class="acts">
    <Button type="submit" {loading}>ذخیرهٔ رمز عبور</Button>
    {#if !isTemp}<Button variant="text" href="/account">انصراف</Button>{/if}
  </div>
</form>

<style>
  .form {
    display: grid;
    gap: var(--space-md);
    max-width: 28rem;
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }
</style>
