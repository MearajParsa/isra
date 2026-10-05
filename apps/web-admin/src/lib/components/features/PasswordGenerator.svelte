<script lang="ts">
  import { generatePassword } from '$lib/utils/password';
  import PasswordField from '$lib/components/ui/PasswordField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    value?: string;
    error?: string | null;
    disabled?: boolean;
    label?: string;
  }
  let { value = $bindable(''), error = null, disabled = false, label = 'رمز موقت' }: Props = $props();
</script>

<div class="pg">
  <PasswordField {label} bind:value autocomplete="new-password" {error} {disabled} hint="دست‌کم ۸ نویسه. کاربر در اولین ورود باید رمز را عوض کند." />
  <Button variant="secondary" size="sm" {disabled} onclick={() => (value = generatePassword())}><Icon name="sparkles" size={18} />تولید رمز قوی</Button>
</div>

<style>
  .pg {
    display: grid;
    gap: var(--space-sm);
    justify-items: start;
  }
  .pg > :global(:first-child) {
    justify-self: stretch;
  }
</style>
