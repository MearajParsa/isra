<script lang="ts">
  import Icon from './Icon.svelte';
  interface Props {
    label: string;
    value?: string;
    rows?: number;
    maxlength?: number;
    error?: string | null;
    hint?: string;
    disabled?: boolean;
    required?: boolean;
  }
  let { label, value = $bindable(''), rows = 4, maxlength, error = null, hint, disabled = false, required = false }: Props = $props();
  const uid = $props.id();
  const fid = $derived(`ta-${uid}`);
</script>

<div class="field" class:invalid={!!error}>
  <label for={fid}>{label}{#if required}<span class="req" aria-hidden="true"> *</span>{/if}</label>
  <textarea id={fid} {rows} {maxlength} {disabled} {required} bind:value aria-invalid={!!error} aria-describedby={error || hint ? `${fid}-d` : undefined}></textarea>
  {#if error}
    <p class="msg error" id={`${fid}-d`} role="alert"><Icon name="alert" size={16} />{error}</p>
  {:else if hint}
    <p class="msg" id={`${fid}-d`}>{hint}</p>
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
  textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    resize: vertical;
    line-height: 1.8;
  }
  textarea:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  .invalid textarea {
    border-color: var(--color-error);
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
