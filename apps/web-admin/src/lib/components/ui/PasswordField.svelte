<script lang="ts">
  import TextField from './TextField.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    label?: string;
    value?: string;
    error?: string | null;
    hint?: string;
    autocomplete?: 'current-password' | 'new-password';
    disabled?: boolean;
  }
  let {
    label = 'رمز عبور',
    value = $bindable(''),
    error = null,
    hint,
    autocomplete = 'current-password',
    disabled = false
  }: Props = $props();

  let shown = $state(false);
</script>

<TextField {label} bind:value type={shown ? 'text' : 'password'} {autocomplete} {error} {hint} {disabled} ltr>
  {#snippet trailing()}
    <button
      type="button"
      class="toggle"
      onclick={() => (shown = !shown)}
      aria-label={shown ? 'پنهان کردن رمز' : 'نمایش رمز'}
      aria-pressed={shown}
    >
      <Icon name={shown ? 'eye-off' : 'eye'} size={20} />
    </button>
  {/snippet}
</TextField>

<style>
  .toggle {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
    color: var(--color-muted);
    border-radius: var(--radius-sm);
  }
  .toggle:hover {
    color: var(--color-primary);
  }
</style>
