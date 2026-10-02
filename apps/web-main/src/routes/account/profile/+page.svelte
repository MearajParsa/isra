<script lang="ts">
  import { api } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import { formatPhone } from '$lib/utils/phone';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';

  let firstName = $state(auth.me?.profile.firstName ?? '');
  let lastName = $state(auth.me?.profile.lastName ?? '');
  let errors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);
  let loading = $state(false);

  const dirty = $derived(
    firstName.trim() !== (auth.me?.profile.firstName ?? '') || lastName.trim() !== (auth.me?.profile.lastName ?? '')
  );

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    formError = null;
    const f = firstName.trim();
    const l = lastName.trim();
    if (f.length < 2) errors.firstName = 'نام باید دست‌کم ۲ نویسه باشد.';
    if (l.length < 2) errors.lastName = 'نام خانوادگی باید دست‌کم ۲ نویسه باشد.';
    if (Object.keys(errors).length) return;

    loading = true;
    try {
      const profile = await auth.withAuth((t) => api.me.updateProfile(t, { firstName: f, lastName: l }));
      auth.updateProfile(profile);
      firstName = profile.firstName;
      lastName = profile.lastName;
      toasts.success('تغییرات ذخیره شد.');
    } catch (err) {
      errors = fieldErrors(err);
      if (Object.keys(errors).length === 0) formError = errorMessage(err);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>پروفایل — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHeader title="پروفایل" backHref="/account" />

<form onsubmit={submit} novalidate class="form">
  <TextField label="نام" bind:value={firstName} autocomplete="given-name" error={errors.firstName} disabled={loading} required />
  <TextField label="نام خانوادگی" bind:value={lastName} autocomplete="family-name" error={errors.lastName} disabled={loading} required />
  <TextField
    label="شمارهٔ موبایل"
    value={auth.me ? formatPhone(auth.me.phone) : ''}
    disabled
    ltr
    hint="شمارهٔ موبایل از اینجا قابل تغییر نیست."
  />

  {#if formError}<NoticeBanner tone="error" role="alert">{formError}</NoticeBanner>{/if}

  <div class="acts">
    <Button type="submit" {loading} disabled={!dirty}>ذخیرهٔ تغییرات</Button>
    <Button variant="text" href="/account">انصراف</Button>
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
