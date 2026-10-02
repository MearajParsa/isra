<script lang="ts">
  import type { Member, SessionRole } from '$lib/api/mid-types';
  import { formatRelative } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import RoleChips from '$lib/components/ui/RoleChips.svelte';

  interface Props {
    member: Member;
    canApprove: boolean;
    canRoles: boolean;
    busy?: boolean;
    ondecide: (m: Member, action: 'approve' | 'reject') => void;
    onroles: (m: Member, roles: SessionRole[]) => void;
  }
  let { member: m, canApprove, canRoles, busy = false, ondecide, onroles }: Props = $props();

  const isManager = $derived(m.roles.includes('session_manager'));
  const toggles: { r: SessionRole; l: string }[] = [
    { r: 'session_supporter', l: 'پشتیبان' },
    { r: 'teacher', l: 'معلم' }
  ];

  function toggle(r: SessionRole) {
    const has = m.roles.includes(r);
    const next = has ? m.roles.filter((x) => x !== r) : [...m.roles.filter((x) => x !== 'quran_student'), r];
    onroles(m, next);
  }
</script>

<li class="row">
  <div class="txt">
    <strong>{m.name}</strong>
    <span class="muted small">درخواست {formatRelative(m.requestedAt)}</span>
    <RoleChips roles={m.roles} membership={m.status} />
  </div>

  {#if m.status === 'pending' && canApprove}
    <div class="acts">
      <Button size="sm" loading={busy} onclick={() => ondecide(m, 'approve')}>تأیید</Button>
      <Button size="sm" variant="secondary" disabled={busy} onclick={() => ondecide(m, 'reject')}>رد</Button>
    </div>
  {:else if m.status === 'approved' && canRoles && !isManager}
    <div class="roles" role="group" aria-label={`نقش‌های ${m.name}`}>
      {#each toggles as t (t.r)}
        <label class="chk">
          <input type="checkbox" checked={m.roles.includes(t.r)} disabled={busy} onchange={() => toggle(t.r)} />
          <span>{t.l}</span>
        </label>
      {/each}
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
  .acts,
  .roles {
    display: flex;
    gap: var(--space-sm);
  }
  .chk {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 12px;
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-pill);
    font-size: var(--fs-sm);
    font-weight: 700;
    cursor: pointer;
  }
  .chk input {
    width: 18px;
    height: 18px;
    accent-color: var(--color-accent);
  }
</style>
