<script lang="ts">
  import { goto } from '$app/navigation';
  import { midApi } from '$lib/api';
  import type { SessionInput } from '$lib/api/mid-types';
  import { auth } from '$lib/auth/auth.svelte';
  import { caps } from '$lib/stores/caps.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import SessionForm from '$lib/components/features/SessionForm.svelte';

  const initial: SessionInput = {
    title: '',
    description: '',
    location: { label: '' },
    schedule: { type: 'recurring', weekdays: [4], timeOfDay: '18:00', durationMin: 60 }
  };

  let busy = $state(false);
  let errors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);

  async function submit(input: SessionInput) {
    busy = true;
    errors = {};
    formError = null;
    try {
      const s = await auth.withAuth((t) => midApi.sessions.create(t, input));
      toasts.success('جلسه به‌صورت پیش‌نویس ساخته شد. پس از بررسی آن را منتشر کنید.');
      await goto(`/manage/${s.id}`);
    } catch (e) {
      errors = fieldErrors(e);
      if (Object.keys(errors).length === 0) formError = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>ساخت جلسه — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHeader title="ساخت جلسهٔ جدید" backHref="/manage" />

{#if caps.canCreate}
  <SessionForm {initial} submitLabel="ساخت پیش‌نویس" {busy} {errors} {formError} onsubmit={submit} cancelHref="/manage" />
{:else}
  <EmptyState icon="lock" title="ساخت جلسه برای حساب شما فعال نیست" message="برای ساخت جلسه باید مجوز لازم را از مدیر سیستم بگیرید.">
    {#snippet action()}<Button href="/manage">بازگشت</Button>{/snippet}
  </EmptyState>
{/if}
