<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sheet from './Sheet.svelte';
  import Button from './Button.svelte';
  import NoticeBanner from './NoticeBanner.svelte';
  import TextField from './TextField.svelte';

  interface Props {
    open?: boolean;
    title: string;
    /** عبارتی که باید تایپ شود */
    phrase: string;
    confirmLabel: string;
    onconfirm: () => void | Promise<void>;
    children: Snippet;
    error?: string | null;
  }
  let { open = $bindable(false), title, phrase, confirmLabel, onconfirm, children, error = null }: Props = $props();

  let typed = $state('');
  let busy = $state(false);
  const match = $derived(typed.trim() === phrase.trim());

  $effect(() => {
    if (!open) typed = '';
  });

  async function confirm() {
    if (!match) return;
    busy = true;
    try {
      await onconfirm();
    } finally {
      busy = false;
    }
  }
</script>

<Sheet bind:open {title} dismissible={!busy}>
  <NoticeBanner tone="error" icon="alert">{@render children()}</NoticeBanner>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void confirm();
    }}
    class="f"
  >
    <TextField label={`برای تأیید، عبارت «${phrase}» را بنویسید`} bind:value={typed} autocomplete="off" disabled={busy} />
    {#if error}<NoticeBanner tone="error" role="alert">{error}</NoticeBanner>{/if}
    <div class="acts">
      <Button type="submit" variant="danger" disabled={!match} loading={busy} full>{confirmLabel}</Button>
      <Button variant="secondary" disabled={busy} onclick={() => (open = false)} full>انصراف</Button>
    </div>
  </form>
</Sheet>

<style>
  .f {
    display: grid;
    gap: var(--space-md);
  }
  .acts {
    display: grid;
    gap: var(--space-sm);
  }
  @media (min-width: 640px) {
    .acts {
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
    }
  }
</style>
