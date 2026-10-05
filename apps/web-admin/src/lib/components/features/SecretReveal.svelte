<script lang="ts">
  import { copyText } from '$lib/utils/clipboard';
  import { toasts } from '$lib/stores/toast.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    secret: string;
    label?: string;
  }
  let { secret, label = 'رمز موقت' }: Props = $props();
  let copied = $state(false);

  async function copy() {
    copied = await copyText(secret);
    if (copied) {
      toasts.success('رمز در کلیپ‌بورد کپی شد.');
      setTimeout(() => (copied = false), 2500);
    } else toasts.error('کپی خودکار ممکن نشد؛ رمز را دستی کپی کنید.');
  }
</script>

<div class="box">
  <span class="lbl">{label}</span>
  <div class="row">
    <code dir="ltr" aria-label={label}>{secret}</code>
    <Button variant="secondary" size="sm" onclick={copy}><Icon name={copied ? 'check' : 'share'} size={18} />{copied ? 'کپی شد' : 'کپی'}</Button>
  </div>
</div>

<style>
  .box {
    display: grid;
    gap: 6px;
    padding: var(--space-md);
    background: var(--color-warm-tint);
    border: 1px dashed color-mix(in srgb, var(--color-accent-warm) 80%, var(--color-primary));
    border-radius: var(--radius-md);
  }
  .lbl {
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }
  code {
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.04em;
    word-break: break-all;
    user-select: all;
  }
</style>
