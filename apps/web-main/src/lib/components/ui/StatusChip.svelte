<script lang="ts">
  import type { SessionStatus } from '$lib/api/types';
  import { statusLabel } from '$lib/utils/format';

  let { status }: { status: SessionStatus } = $props();
</script>

<span class="chip {status}">
  {#if status === 'started'}<span class="dot" aria-hidden="true"></span>{/if}
  {statusLabel[status]}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    font-size: var(--fs-xs);
    font-weight: 700;
    line-height: 1.8;
    white-space: nowrap;
  }
  .scheduled {
    background: var(--color-primary-tint);
    color: var(--color-primary);
  }
  .started {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .ended {
    background: var(--color-secondary);
    color: var(--color-muted);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-turquoise);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
