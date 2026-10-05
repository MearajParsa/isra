<script lang="ts">
  interface Option {
    value: string;
    label: string;
    disabled?: boolean;
  }
  interface Props {
    label: string;
    value?: string;
    options: Option[];
    id?: string;
    disabled?: boolean;
    hint?: string;
    onchange?: (v: string) => void;
  }
  let { label, value = $bindable(''), options, id, disabled = false, hint, onchange }: Props = $props();
  const uid = $props.id();
  const fid = $derived(id ?? `sel-${uid}`);
</script>

<div class="field">
  <label for={fid}>{label}</label>
  <select id={fid} bind:value {disabled} aria-describedby={hint ? `${fid}-h` : undefined} onchange={() => onchange?.(value)}>
    {#each options as o (o.value)}<option value={o.value} disabled={o.disabled}>{o.label}</option>{/each}
  </select>
  {#if hint}<p class="hint" id={`${fid}-h`}>{hint}</p>{/if}
</div>

<style>
  .field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  label {
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  select {
    width: 100%;
    min-height: var(--control-h);
    padding: 0 var(--space-md);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    font-size: var(--fs-md);
  }
  select:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-outline));
  }
  select:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  select:disabled {
    background: var(--color-neutral);
    color: var(--color-muted);
  }
  .hint {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
</style>
