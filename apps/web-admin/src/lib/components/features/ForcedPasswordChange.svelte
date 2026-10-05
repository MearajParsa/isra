<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { account } from '$lib/auth/account.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import { passwordError } from '$lib/utils/password';
  import { withBase } from '$lib/utils/paths';
  import LogoMark from '$lib/components/ui/LogoMark.svelte';
  import PasswordField from '$lib/components/ui/PasswordField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';

  let current = $state('');
  let next = $state('');
  let confirm = $state('');
  let errors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);
  let loading = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    formError = null;
    if (!current) errors.currentPassword = 'رمز موقت را وارد کنید.';
    const pe = passwordError(next);
    if (pe) errors.newPassword = pe;
    else if (next === current) errors.newPassword = 'رمز جدید باید با رمز موقت فرق داشته باشد.';
    if (confirm !== next) errors.confirm = 'تکرار رمز با رمز جدید یکسان نیست.';
    if (Object.keys(errors).length) return;

    loading = true;
    try {
      // به‌جای step-up، رمز موقت (currentPassword) پذیرفته می‌شود
      await auth.withAuth((t) => api.system.setMyPassword(t, { newPassword: next, currentPassword: current }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AUTH_INVALID_CREDENTIALS') errors.currentPassword = 'رمز موقت درست نیست.';
      else {
        errors = fieldErrors(err);
        if (Object.keys(errors).length === 0) formError = errorMessage(err);
      }
      loading = false;
      return;
    }
    try {
      // سایر نشست‌ها revoke شده‌اند و نشست جاری می‌ماند؛ توکن تازه بدون claim `mcp` می‌گیریم
      await auth.refreshNow();
      auth.mustChangePassword = false;
      await account.load();
      await system.load(true);
      current = next = confirm = '';
      toasts.success('رمز جدید ذخیره شد. خوش آمدید!');
      await goto(withBase('/'), { replaceState: true });
    } catch {
      formError = 'رمز ذخیره شد اما تمدید نشست ممکن نشد. دوباره وارد شوید.';
      await logout();
    } finally {
      loading = false;
    }
  }

  async function logout() {
    await auth.logout().catch(() => undefined);
    system.reset();
    account.reset();
    await goto(withBase('/login'), { replaceState: true });
  }
</script>

<svelte:head><title>تعیین رمز جدید — مدیریت اسراء</title></svelte:head>

<div class="wrap">
  <LogoMark height={72} />
  <main class="card" id="main">
    <div class="head">
      <h1>تعیین رمز جدید</h1>
      <p class="muted">رمز شما را مدیر سیستم موقتاً تعیین کرده است. برای ادامه، رمز موقت را وارد و رمز دلخواه خود را بسازید.</p>
    </div>
    <form onsubmit={submit} novalidate class="form">
      <PasswordField label="رمز موقت فعلی" bind:value={current} autocomplete="current-password" error={errors.currentPassword} disabled={loading} />
      <PasswordField label="رمز جدید" bind:value={next} autocomplete="new-password" error={errors.newPassword} hint="دست‌کم ۸ نویسه." disabled={loading} />
      <PasswordField label="تکرار رمز جدید" bind:value={confirm} autocomplete="new-password" error={errors.confirm} disabled={loading} />
      {#if formError}<NoticeBanner tone="error" role="alert">{formError}</NoticeBanner>{/if}
      <Button type="submit" {loading} full>ذخیرهٔ رمز و ادامه</Button>
      <Button variant="text" disabled={loading} onclick={logout} full>خروج از حساب</Button>
    </form>
  </main>
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
  .form {
    display: grid;
    gap: var(--space-md);
  }
</style>
