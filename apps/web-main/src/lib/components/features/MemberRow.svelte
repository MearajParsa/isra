<script lang="ts">
  import type { Member } from '$lib/api/mid-types';
  import { formatRelative } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import RoleChips from '$lib/components/ui/RoleChips.svelte';

  interface Props {
    member: Member;
    canApprove: boolean;
    busy?: boolean;
    ondecide: (m: Member, action: 'approve' | 'reject') => void;
  }
  /** ۱.۷.۰: ردیف فقط عضو (قرآن‌آموز) است؛ نقش‌های درون جلسه حذف شد (پشتیبان‌ها جدا، docs-v2/31 §۲) */
  let { member: m, canApprove, busy = false, ondecide }: Props = $props();
</script>

<li class="row">
  <div class="txt">
    <strong>{m.name}</strong>
    <span class="muted small">درخواست {formatRelative(m.requestedAt)}</span>
    <RoleChips role="member" membership={m.status} />
  </div>

  {#if m.status === 'pending' && canApprove}
    <div class="acts">
      <Button size="sm" loading={busy} onclick={() => ondecide(m, 'approve')}>تأیید</Button>
      <Button size="sm" variant="secondary" disabled={busy} onclick={() => ondecide(m, 'reject')}>رد</Button>
    </div>
  {/if}
</li>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  .txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .small {
    font-size: var(--fs-xs);
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
  }
</style>
