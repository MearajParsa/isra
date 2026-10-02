<script lang="ts">
  import Sheet from './Sheet.svelte';
  import Button from './Button.svelte';

  interface Props {
    open?: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
    onconfirm: () => void | Promise<void>;
  }

  let {
    open = $bindable(false),
    title,
    message,
    confirmLabel,
    cancelLabel = 'انصراف',
    destructive = false,
    onconfirm
  }: Props = $props();

  let busy = $state(false);

  async function confirm() {
    busy = true;
    try {
      await onconfirm();
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<Sheet bind:open {title} dismissible={!busy}>
  <p class="muted">{message}</p>
  {#snippet footer()}
    <Button variant={destructive ? 'danger' : 'primary'} loading={busy} onclick={confirm} full>{confirmLabel}</Button>
    <Button variant="secondary" disabled={busy} onclick={() => (open = false)} full>{cancelLabel}</Button>
  {/snippet}
</Sheet>
