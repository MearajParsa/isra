<script lang="ts">
  import type { SessionMe } from '$lib/api/mid-types';
  import type { SessionState } from '$lib/api/mid-types';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import RoleChips from '$lib/components/ui/RoleChips.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    sessionId: string;
    status: SessionState;
    me: SessionMe;
    busy?: boolean;
    onrequest: () => void;
  }
  let { sessionId, status, me, busy = false, onrequest }: Props = $props();
  const m = $derived(me.membership);
  const staff = $derived(me.permissions.length > 0);
</script>

{#if status === 'ended' && m?.status !== 'approved'}
  <NoticeBanner tone="info">این جلسه پایان یافته است.</NoticeBanner>
{:else if !m}
  <p class="muted small">برای حضور در جلسه ابتدا عضو شوید. درخواست شما برای مدیر یا پشتیبان جلسه ارسال می‌شود.</p>
  <Button full loading={busy} onclick={onrequest}>درخواست عضویت</Button>
{:else if m.status === 'pending'}
  <NoticeBanner tone="warning">درخواست عضویت شما ثبت شد و در انتظار تأیید مدیر یا پشتیبان جلسه است.</NoticeBanner>
{:else if m.status === 'rejected'}
  <NoticeBanner tone="error">درخواست عضویت شما در این جلسه پذیرفته نشد.</NoticeBanner>
{:else}
  <div class="role"><span class="muted small">نقش شما:</span><RoleChips roles={m.roles} /></div>
  <Button full href={`/sessions/${sessionId}/live`}>
    <Icon name="mic" size={18} />{status === 'started' ? 'ورود به اتاق جلسه' : 'اتاق جلسه'}
  </Button>
  {#if staff}
    <Button full variant="secondary" href={`/manage/${sessionId}`}><Icon name="shield" size={18} />پنل مدیریت جلسه</Button>
  {/if}
{/if}

<style>
  .small {
    font-size: var(--fs-sm);
  }
  .role {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }
</style>
