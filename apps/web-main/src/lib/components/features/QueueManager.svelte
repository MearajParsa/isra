<script lang="ts">
  import type { QueueAction, QueueState } from '$lib/api/mid-types';
  import { formatNumber, formatTime } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';

  interface Props {
    queue: QueueState;
    started: boolean;
    canEvaluate: boolean;
    busy?: boolean;
    onnext: () => void;
    onact: (itemId: string, action: QueueAction) => void;
    onevaluate: (itemId: string) => void;
  }
  let { queue, started, canEvaluate, busy = false, onnext, onact, onevaluate }: Props = $props();
</script>

<div class="wrap">
  <section class="cur" aria-labelledby="cur-h">
    <div>
      <h3 id="cur-h">نفر جاری</h3>
      {#if queue.current}
        <p class="who">{queue.current.name}</p>
        {#if queue.current.evaluated}<p class="muted small">ارزیابی ثبت شد</p>{/if}
      {:else}
        <p class="muted">کسی در حال قرائت نیست.</p>
      {/if}
    </div>
    <div class="acts">
      {#if canEvaluate && queue.current && !queue.current.evaluated}
        <Button variant="secondary" size="sm" onclick={() => onevaluate(queue.current!.id)}>ارزیابی</Button>
      {/if}
      <Button
        loading={busy}
        disabled={!started || (queue.waiting.length === 0 && !queue.current)}
        onclick={onnext}
      >
        {queue.waiting.length ? 'نفر بعدی' : 'پایان نوبت'}<Icon name="chevron-left" size={18} />
      </Button>
    </div>
  </section>

  <h3 class="h">منتظران ({formatNumber(queue.waiting.length)})</h3>
  {#if queue.waiting.length === 0}
    <EmptyState icon="users" compact title="صف خالی است" message="وقتی قرآن‌آموزان حاضر به صف بپیوندند اینجا دیده می‌شوند." />
  {:else}
    <ol class="list">
      {#each queue.waiting as item, i (item.id)}
        <li class="row">
          <span class="n">{formatNumber(item.position ?? i + 1)}</span>
          <span class="txt">
            <strong>{item.name}</strong>
            <span class="muted small">از {formatTime(item.joinedAt)}</span>
          </span>
          <span class="btns">
            <button type="button" aria-label={`بالا بردن ${item.name}`} disabled={i === 0 || busy} onclick={() => onact(item.id, 'up')}>
              <Icon name="chevron-left" size={18} class="up" />
            </button>
            <button type="button" aria-label={`پایین بردن ${item.name}`} disabled={i === queue.waiting.length - 1 || busy} onclick={() => onact(item.id, 'down')}>
              <Icon name="chevron-left" size={18} class="down" />
            </button>
            <button type="button" aria-label={`انتقال ${item.name} به انتها`} disabled={i === queue.waiting.length - 1 || busy} onclick={() => onact(item.id, 'skip')}>
              <Icon name="refresh" size={18} />
            </button>
            <button type="button" class="rm" aria-label={`حذف ${item.name} از صف`} disabled={busy} onclick={() => onact(item.id, 'remove')}>
              <Icon name="x" size={18} />
            </button>
          </span>
        </li>
      {/each}
    </ol>
  {/if}

  {#if queue.done.length > 0}
    <h3 class="h">قرائت‌شده‌ها ({formatNumber(queue.done.length)})</h3>
    <ul class="list">
      {#each queue.done as item (item.id)}
        <li class="row done">
          <span class="n"><Icon name="check" size={16} /></span>
          <span class="txt"><strong>{item.name}</strong></span>
          {#if item.evaluated}
            <span class="tag ok">ارزیابی شد</span>
          {:else if canEvaluate}
            <Button size="sm" variant="secondary" onclick={() => onevaluate(item.id)}>ارزیابی</Button>
          {:else}
            <span class="tag">بدون ارزیابی</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .wrap {
    display: grid;
    gap: var(--space-md);
  }
  .cur {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-radius: var(--radius-lg);
  }
  .cur .muted {
    color: color-mix(in srgb, var(--color-on-primary) 70%, transparent);
  }
  .who {
    font-size: var(--fs-xl);
    font-weight: 700;
    color: var(--color-accent-warm);
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
  }
  .cur :global(.secondary) {
    color: var(--color-on-primary);
    border-color: color-mix(in srgb, var(--color-on-primary) 50%, transparent);
  }
  .cur :global(.primary) {
    background: var(--color-accent-warm);
    color: var(--color-primary);
  }
  .h {
    margin-top: var(--space-sm);
  }
  .small {
    font-size: var(--fs-sm);
  }
  .list {
    display: grid;
    gap: var(--space-sm);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm) var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  .row.done {
    background: var(--color-neutral);
  }
  .n {
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--color-secondary);
    font-weight: 700;
  }
  .txt {
    display: grid;
    flex: 1;
    min-width: 8rem;
  }
  .btns {
    display: flex;
    gap: 2px;
    margin-inline-start: auto;
  }
  .btns button {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-primary);
  }
  .btns button:hover:not(:disabled) {
    background: var(--color-secondary);
  }
  .btns button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .rm {
    color: var(--color-error) !important;
  }
  :global(.up) {
    transform: rotate(90deg);
  }
  :global(.down) {
    transform: rotate(-90deg);
  }
  .tag {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .tag.ok {
    color: var(--color-accent);
    font-weight: 700;
  }
</style>
