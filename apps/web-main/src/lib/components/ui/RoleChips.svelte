<script lang="ts">
  import type { MembershipStatus, SessionRole } from '$lib/api/mid-types';

  interface Props {
    roles?: SessionRole[];
    membership?: MembershipStatus;
  }
  let { roles = [], membership }: Props = $props();

  const roleLabel: Record<SessionRole, string> = {
    session_manager: 'مدیر جلسه',
    session_supporter: 'پشتیبان',
    teacher: 'معلم',
    quran_student: 'قرآن‌آموز'
  };
  const memLabel: Record<MembershipStatus, string> = {
    pending: 'در انتظار تأیید',
    approved: 'عضو',
    rejected: 'رد شده'
  };
</script>

<span class="chips">
  {#if membership && membership !== 'approved'}
    <span class="chip m-{membership}">{memLabel[membership]}</span>
  {:else}
    {#each roles as r (r)}
      <span class="chip r-{r}">{roleLabel[r]}</span>
    {/each}
  {/if}
</span>

<style>
  .chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    padding: 1px 10px;
    border-radius: var(--radius-pill);
    font-size: var(--fs-xs);
    font-weight: 700;
    line-height: 1.8;
    white-space: nowrap;
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .r-session_manager {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
  .r-session_supporter,
  .r-teacher {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .m-pending {
    background: var(--color-warm-tint);
    border: 1px solid var(--color-accent-warm);
  }
  .m-rejected {
    background: var(--color-error-tint);
    color: var(--color-error);
  }
</style>
