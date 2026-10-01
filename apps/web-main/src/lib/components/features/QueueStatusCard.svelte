<script lang="ts">
  import type { QueueState } from '$lib/api/mid-types';
  import { formatNumber } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    queue: QueueState;
    started: boolean;
    present: boolean;
    busy?: boolean;
    onjoin: () => void;
    onleave: () => void;
  }
  let { queue, started, present, busy = false, onjoin, onleave }: Props = $props();

  const myTurn = $derived(queue.current?.isMe ?? false);
  const waiting = $derived(queue.myItem?.status === 'waiting');
</script>

<section class="card" class:turn={myTurn} aria-labelledby="q-h">
  <div class="head">
    <span class="ico"><Icon name="mic" size={26} /></span>
    <div>
      <h3 id="q-h">نوبت قرائت</h3>
      <p class="muted small">{formatNumber(queue.waitingCount)} نفر در صف منتظر هستند</p>
    </div>
  </div>

  <div class="now" aria-live="polite">
    {#if myTurn}
      <p class="mine"><strong>نوبت شماست!</strong> قرائت خود را شروع کنید.</p>
    {:else if queue.current}
      <p class="muted small">در حال قرائت</p>
      <p class="who">{queue.current.name}</p>
    {:else}
      <p class="muted">فعلاً کسی در حال قرائت نیست.</p>
    {/if}
  </div>

  {#if waiting}
    <div class="pos">
      <span>جایگاه شما در صف</span>
      <strong>{formatNumber(queue.myPosition ?? 0)}</strong>
    </div>
    <Button variant="secondary" loading={busy} onclick={onleave} full>انصراف از صف</Button>
  {:else if !myTurn}
    <Button loading={busy} disabled={!started || !present} onclick={onjoin} full>پیوستن به صف</Button>
    {#if started && !present}<p class="muted small center">برای پیوستن به صف ابتدا حضور خود را ثبت کنید.</p>{/if}
  {/if}
</section>

<style>
  .card {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .turn {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-color: var(--color-primary);
    animation: glow 1.8s ease-in-out infinite;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .turn .ico {
    background: var(--color-turquoise);
  }
  .turn .muted {
    color: color-mix(in srgb, var(--color-on-primary) 75%, transparent);
  }
  .small {
    font-size: var(--fs-sm);
  }
  .center {
    text-align: center;
  }
  .now {
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-neutral);
    text-align: center;
  }
  .turn .now {
    background: color-mix(in srgb, var(--color-on-primary) 12%, transparent);
  }
  .who {
    font-size: var(--fs-lg);
    font-weight: 700;
  }
  .mine {
    font-size: var(--fs-lg);
    color: var(--color-accent-warm);
  }
  .pos {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-warm-tint);
  }
  .pos strong {
    font-size: var(--fs-xxl);
  }
  @keyframes glow {
    50% {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-turquoise) 35%, transparent);
    }
  }
</style>
