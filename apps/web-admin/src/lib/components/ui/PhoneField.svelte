<script lang="ts">
  import TextField from './TextField.svelte';
  import { toLatinDigits } from '$lib/utils/phone';

  interface Props {
    value?: string;
    error?: string | null;
    disabled?: boolean;
    label?: string;
  }
  let { value = $bindable(''), error = null, disabled = false, label = 'شمارهٔ موبایل' }: Props = $props();

  function clean(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const v = toLatinDigits(el.value).replace(/[^\d+]/g, '').slice(0, 14);
    if (v !== el.value) el.value = v;
    value = v;
  }
</script>

<TextField
  {label}
  bind:value
  type="tel"
  inputmode="tel"
  autocomplete="tel-national"
  placeholder="09123456789"
  {error}
  {disabled}
  maxlength={14}
  ltr
  oninput={clean}
/>
