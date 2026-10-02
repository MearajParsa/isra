<script lang="ts">
  let { connected }: { connected: boolean } = $props();
</script>

<span class="live" class:off={!connected} role="status">
  <span class="dot" aria-hidden="true"></span>
  {connected ? 'زنده' : 'قطع اتصال'}
</span>

<style>
  .live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 12px;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-size: var(--fs-xs);
    font-weight: 700;
  }
  .off {
    background: var(--color-neutral);
    color: var(--color-muted);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-turquoise);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .off .dot {
    background: var(--color-gray);
    animation: none;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
