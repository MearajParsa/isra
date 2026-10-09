<script lang="ts">
  interface Props {
    label: string;
    weight: number;
    /** سقف نمرهٔ معیار (۱.۷.۰: پویا) */
    max?: number;
    value?: number;
    error?: string | null;
    disabled?: boolean;
  }
  let { label, weight, max = 10, value = $bindable(5), error = null, disabled = false }: Props = $props();
  const uid = $props.id();
  const pct = $derived(max > 0 ? (value / max) * 100 : 0);
</script>

<div class="row" class:invalid={!!error}>
  <div class="head">
    <label for={`s-${uid}`}>{label} <span class="muted w">(وزن {weight.toLocaleString('fa-IR')}٪)</span></label>
    <output for={`s-${uid}`} class="val">{value.toLocaleString('fa-IR')}</output>
  </div>
  <input
    id={`s-${uid}`}
    type="range"
    min="0"
    {max}
    step="1"
    bind:value
    {disabled}
    style:--pct="{pct}%"
    aria-invalid={!!error}
  />
  <div class="ticks" aria-hidden="true"><span>۰</span><span>{max.toLocaleString('fa-IR')}</span></div>
  {#if error}<p class="err" role="alert">{error}</p>{/if}
</div>

<style>
  .row {
    display: grid;
    gap: 4px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  label {
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .w {
    font-weight: 400;
    font-size: var(--fs-xs);
  }
  .val {
    min-width: 2ch;
    font-weight: 700;
    font-size: var(--fs-xl);
    color: var(--color-primary);
    text-align: end;
  }
  input[type='range'] {
    appearance: none;
    width: 100%;
    height: 8px;
    border-radius: var(--radius-pill);
    background: linear-gradient(to left, var(--color-accent) var(--pct), var(--color-outline) var(--pct));
    outline-offset: 6px;
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-primary);
    border: 3px solid var(--color-accent-warm);
    cursor: grab;
  }
  input[type='range']::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--color-primary);
    border: 3px solid var(--color-accent-warm);
    cursor: grab;
  }
  .ticks {
    display: flex;
    justify-content: space-between;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .err {
    color: var(--color-error);
    font-size: var(--fs-sm);
  }
</style>
