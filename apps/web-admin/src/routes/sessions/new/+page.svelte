<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError, type SessionInput } from '$lib/api';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { withBase } from '$lib/utils/paths';
  import { stepped, describeError } from '$lib/utils/adminCall';
  import { fieldErrors } from '$lib/utils/errors';
  import { emptySessionInput, mapServerFields } from '$lib/utils/sessionForm';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import SessionForm from '$lib/components/features/SessionForm.svelte';
  import UserPicker from '$lib/components/features/UserPicker.svelte';

  const canManage = $derived(system.can('system.sessions.manage'));
  const canPickUser = $derived(system.can('system.users.view'));
  let creatorId = $state('');
  let busy = $state(false);
  let serverErrors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);

  async function create(input: SessionInput) {
    busy = true;
    serverErrors = {};
    formError = null;
    try {
      const body = { ...(creatorId ? { creatorId } : {}), session: input };
      const s = await stepped((t, su) => api.system.createSession(t, body, su));
      if (!s) return;
      toasts.success('جلسه به‌صورت پیش‌نویس ساخته شد.');
      await goto(withBase(`/sessions/${s.id}`), { replaceState: true });
    } catch (e) {
      const f = fieldErrors(e);
      if (Object.keys(f).length) serverErrors = mapServerFields(f);
      else formError = e instanceof ApiError && e.code === 'NOT_FOUND' ? 'سازندهٔ انتخاب‌شده پیدا نشد.' : describeError(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>جلسهٔ جدید — مدیریت اسراء</title></svelte:head>

<PageHeader title="جلسهٔ جدید" subtitle="جلسه از طرف یک کاربر ساخته می‌شود و او «استاد صاحب جلسه» خواهد بود." backHref={withBase('/sessions')} />

{#if !canManage}
  <EmptyState icon="lock" title="مجوز ساخت جلسه ندارید" message="مجوز «مدیریت جلسه‌ها» برای نقش شما فعال نیست." />
{:else}
  <SessionForm initial={emptySessionInput()} submitLabel="ساخت جلسه (پیش‌نویس)" {busy} {serverErrors} {formError} onsubmit={create} oncancel={() => goto(withBase('/sessions'))}>
    {#snippet top()}
      {#if canPickUser}
        <UserPicker label="سازندهٔ جلسه (اختیاری)" valueId={creatorId} onchange={(id) => (creatorId = id)} placeholder="پیش‌فرض: خودِ شما" disabled={busy} />
      {:else}
        <NoticeBanner tone="info">سازندهٔ جلسه خودِ شما خواهید بود.</NoticeBanner>
      {/if}
    {/snippet}
  </SessionForm>
{/if}
