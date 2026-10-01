<script lang="ts">
  import { formatTime } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    started: boolean;
    enteredAt: string | null;
    busy?: boolean;
    oncheckin: () => void;
  }
  let { started, enteredAt, busy = false, oncheckin }: Props = $props();
</script>

<section class="card" class:done={!!enteredAt} aria-labelledby="att-h">
  <span class="ico"><Icon name={enteredAt ? 'check' : 'users'} size={26} /></span>
  <div class="txt">
    <h3 id="att-h">حضور شما</h3>
    {#if enteredAt}
      <p>حضور شما ساعت <strong>{formatTime(enteredAt)}</strong> ثبت شد.</p>
    {:else if started}
      <p class="muted">با ثبت حضور، <strong>۵ امتیاز</strong> می‌گیرید (فقط یک‌بار برای هر جلسه).</p>
    {:else}
      <p class="muted">ثبت حضور پس از شروع جلسه فعال می‌شود.</p>
    {/if}
  </div>
  {#if !enteredAt}
    <Button disabled={!started} loading={busy} onclick={oncheckin}>ثبت حضور</Button>
  {/if}
</section>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .done {
    background: var(--color-accent-tint);
    border-color: color-mix(in srgb, var(--color-accent) 35%, transparent);
  }
  .ico {
    display: grid;
    place-items: center;
    flex: none;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .done .ico {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .txt {
    flex: 1;
    min-width: 0;
  }
  p {
    font-size: var(--fs-sm);
  }
  @media (max-width: 539px) {
    .card {
      flex-wrap: wrap;
    }
    .card :global(.btn) {
      width: 100%;
    }
  }
</style>
