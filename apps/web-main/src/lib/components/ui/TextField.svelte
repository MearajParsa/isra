<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    value?: string;
    id?: string;
    name?: string;
    type?: 'text' | 'tel' | 'password';
    inputmode?: 'text' | 'numeric' | 'tel';
    autocomplete?: AutoFill;
    placeholder?: string;
    hint?: string;
    error?: string | null;
    disabled?: boolean;
    required?: boolean;
    /** ارقام/شماره/رمز چپ‌به‌راست نمایش داده شوند */
    ltr?: boolean;
    maxlength?: number;
    trailing?: Snippet;
    oninput?: (e: Event) => void;
    el?: HTMLInputElement | null;
  }

  let {
    label,
    value = $bindable(''),
    id,
    name,
    type = 'text',
    inputmode,
    autocomplete,
    placeholder,
    hint,
    error = null,
    disabled = false,
    required = false,
    ltr = false,
    maxlength,
    trailing,
    oninput,
    el = $bindable(null)
  }: Props = $props();

  const uid = $props.id();
  const fieldId = $derived(id ?? `f-${uid}`);
  const descId = $derived(`${fieldId}-d`);
</script>

<div class="field" class:invalid={!!error}>
  <label for={fieldId}>{label}{#if required}<span class="req" aria-hidden="true"> *</span>{/if}</label>
  <div class="control">
    <input
      bind:this={el}
      bind:value
      id={fieldId}
      {name}
      {type}
      {inputmode}
      {autocomplete}
      {placeholder}
      {disabled}
      {required}
      {maxlength}
      class:ltr
      aria-invalid={!!error}
      aria-describedby={error || hint ? descId : undefined}
      {oninput}
    />
    {#if trailing}<div class="trailing">{@render trailing()}</div>{/if}
  </div>
  {#if error}
    <p class="msg error" id={descId} role="alert"><Icon name="alert" size={16} />{error}</p>
  {:else if hint}
    <p class="msg" id={descId}>{hint}</p>
  {/if}
</div>

<style>
  .field {
    display: grid;
    gap: 6px;
  }
  label {
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .req {
    color: var(--color-error);
  }
  .control {
    position: relative;
    display: flex;
    align-items: center;
  }
  input {
    width: 100%;
    min-height: var(--control-h);
    padding: 0 var(--space-md);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    font-size: var(--fs-md);
    transition:
      border-color var(--dur) var(--ease),
      box-shadow var(--dur) var(--ease);
  }
  input.ltr {
    direction: ltr;
    text-align: right;
  }
  input.ltr::placeholder {
    text-align: right;
  }
  input::placeholder {
    color: color-mix(in srgb, var(--color-muted) 70%, white);
  }
  input:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-outline));
  }
  input:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  input:disabled {
    background: var(--color-secondary);
    color: var(--color-muted);
  }
  .invalid input {
    border-color: var(--color-error);
  }
  .invalid input:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-error) 22%, transparent);
  }
  .trailing {
    position: absolute;
    inset-inline-end: 4px;
    display: flex;
  }
  .control:has(.trailing) input {
    padding-inline-end: 52px;
  }
  .msg {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .msg.error {
    color: var(--color-error);
  }
</style>
