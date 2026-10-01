<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import { safeNext } from '$lib/utils/nav';
  import TextField from '$lib/components/ui/TextField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';

  let firstName = $state('');
  let lastName = $state('');
  let errors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);
  let loading = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    formError = null;
    const f = firstName.trim();
    const l = lastName.trim();
    if (f.length < 2) errors.firstName = 'نام را وارد کنید (دست‌کم ۲ نویسه).';
    if (l.length < 2) errors.lastName = 'نام خانوادگی را وارد کنید (دست‌کم ۲ نویسه).';
    if (Object.keys(errors).length) return;

    loading = true;
    try {
      const profile = await auth.withAuth((t) => api.me.updateProfile(t, { firstName: f, lastName: l }));
      auth.updateProfile(profile);
      toasts.success('پروفایل شما ذخیره شد.');
      await goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    } catch (err) {
      errors = fieldErrors(err);
      if (Object.keys(errors).length === 0) formError = errorMessage(err);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>تکمیل پروفایل — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="head">
  <h1>خوش آمدید!</h1>
  <p class="muted">برای شروع، نام خود را وارد کنید تا در جلسات با همین نام دیده شوید.</p>
</div>

<form onsubmit={submit} novalidate class="form">
  <TextField label="نام" bind:value={firstName} autocomplete="given-name" error={errors.firstName} disabled={loading} required />
  <TextField label="نام خانوادگی" bind:value={lastName} autocomplete="family-name" error={errors.lastName} disabled={loading} required />

  {#if formError}<NoticeBanner tone="error" role="alert">{formError}</NoticeBanner>{/if}

  <Button type="submit" {loading} full>ذخیره و ادامه</Button>
</form>

<style>
  .head {
    display: grid;
    gap: var(--space-xs);
  }
  .form {
    display: grid;
    gap: var(--space-md);
  }
</style>
