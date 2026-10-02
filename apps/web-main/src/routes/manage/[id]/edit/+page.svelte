<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { midApi } from '$lib/api';
  import type { SessionInput, SessionMe } from '$lib/api/mid-types';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import SessionForm from '$lib/components/features/SessionForm.svelte';

  const id = $derived(page.params.id as string);
  const me = new Resource<SessionMe>();
  let busy = $state(false);
  let errors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);

  $effect(() => {
    void me.load(() => auth.withAuth((t) => midApi.sessions.me(t, id)));
  });

  const s = $derived(me.data?.session);
  const editable = $derived(me.data?.permissions.includes('session.edit') && (s?.status === 'draft' || s?.status === 'scheduled'));

  async function submit(input: SessionInput) {
    busy = true;
    errors = {};
    formError = null;
    try {
      await auth.withAuth((t) => midApi.sessions.update(t, id, input));
      toasts.success('تغییرات ذخیره شد.');
      await goto(`/manage/${id}`);
    } catch (e) {
      errors = fieldErrors(e);
      if (Object.keys(errors).length === 0) formError = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>ویرایش جلسه — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHeader title="ویرایش جلسه" backHref={`/manage/${id}`} />

{#if me.status === 'error'}
  <EmptyState icon="alert" tone="error" title="بارگذاری نشد" message={me.error ?? ''} />
{:else if me.status !== 'ready' || !s}
  <Skeleton h="320px" radius="var(--radius-lg)" />
{:else if !editable}
  <EmptyState icon="lock" title="این جلسه قابل ویرایش نیست" message="فقط مدیر جلسه، و فقط تا پیش از شروع جلسه می‌تواند آن را ویرایش کند.">
    {#snippet action()}<Button href={`/manage/${id}`}>بازگشت</Button>{/snippet}
  </EmptyState>
{:else}
  <SessionForm
    initial={{ title: s.title, description: s.description, location: s.location, schedule: s.schedule }}
    submitLabel="ذخیرهٔ تغییرات"
    {busy}
    {errors}
    {formError}
    onsubmit={submit}
    cancelHref={`/manage/${id}`}
  />
{/if}
