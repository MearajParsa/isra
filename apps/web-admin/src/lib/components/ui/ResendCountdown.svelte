<script lang="ts">
  import { Countdown } from '$lib/utils/countdown.svelte';
  import { formatCountdown } from '$lib/utils/format';
  import Button from './Button.svelte';

  interface Props {
    /** ثانیه تا فعال‌شدن ارسال مجدد (با تغییر `token` از نو شروع می‌شود) */
    seconds: number;
    token: unknown;
    busy?: boolean;
    onresend: () => void;
  }
  let { seconds, token, busy = false, onresend }: Props = $props();

  const cd = new Countdown();
  $effect(() => {
    void token;
    cd.start(seconds);
    return () => cd.stop();
  });
</script>

{#if cd.remaining > 0}
  <p class="muted wait" aria-live="off">ارسال مجدد کد تا <strong>{formatCountdown(cd.remaining)}</strong> دیگر</p>
{:else}
  <Button variant="text" loading={busy} onclick={onresend}>ارسال مجدد کد</Button>
{/if}

<style>
  .wait {
    font-size: var(--fs-sm);
    min-height: 40px;
    line-height: 40px;
  }
</style>
