<script lang="ts">
  import { JALALI_MONTHS, gregorianStringToJalali, jalaliMonthLength, jalaliToGregorianString, toJalali } from '$lib/utils/jalali';
  import { formatPlain } from '$lib/utils/format';
  import Icon from './Icon.svelte';
  import TimeField from './TimeField.svelte';

  interface Props {
    label: string;
    /** مقدار میلادی به وقت تهران: `YYYY-MM-DD` یا (با withTime) `YYYY-MM-DDTHH:mm`؛ خروجی هم با همین قالب */
    value: string;
    withTime?: boolean;
    error?: string | null;
    disabled?: boolean;
    onchange: (value: string) => void;
  }
  let { label, value, withTime = false, error = null, disabled = false, onchange }: Props = $props();

  const now = new Date();
  const today = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const j = $derived(gregorianStringToJalali(value) ?? today);
  const time = $derived(withTime && value.length >= 16 ? value.slice(11, 16) : '00:00');
  const years = $derived(Array.from({ length: 8 }, (_, i) => today.jy - 1 + i).concat(j.jy < today.jy - 1 || j.jy > today.jy + 6 ? [j.jy] : []).sort((a, b) => a - b));
  const days = $derived(Array.from({ length: jalaliMonthLength(j.jy, j.jm) }, (_, i) => i + 1));

  function emit(jy: number, jm: number, jd: number, t: string) {
    const d = Math.min(jd, jalaliMonthLength(jy, jm));
    const date = jalaliToGregorianString(jy, jm, d);
    onchange(withTime ? `${date}T${t || '00:00'}` : date);
  }
</script>

<fieldset class="jf" class:invalid={!!error} {disabled}>
  <legend>{label}</legend>
  <div class="row">
    <select aria-label={`${label} — روز`} value={j.jd} onchange={(e) => emit(j.jy, j.jm, Number(e.currentTarget.value), time)}>
      {#each days as d (d)}<option value={d}>{formatPlain(d)}</option>{/each}
    </select>
    <select aria-label={`${label} — ماه`} value={j.jm} onchange={(e) => emit(j.jy, Number(e.currentTarget.value), j.jd, time)}>
      {#each JALALI_MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
    </select>
    <select aria-label={`${label} — سال`} value={j.jy} onchange={(e) => emit(Number(e.currentTarget.value), j.jm, j.jd, time)}>
      {#each years as y (y)}<option value={y}>{formatPlain(y)}</option>{/each}
    </select>
    {#if withTime}
      <div class="time"><TimeField {label} value={time} {disabled} onchange={(t) => emit(j.jy, j.jm, j.jd, t)} /></div>
    {/if}
  </div>
  {#if error}<p class="msg" role="alert"><Icon name="alert" size={16} />{error}</p>{/if}
</fieldset>

<style>
  .jf {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  legend {
    padding: 0;
    margin-bottom: 6px;
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .row {
    display: grid;
    grid-template-columns: 0.8fr 1.4fr 1fr;
    gap: var(--space-sm);
  }
  .row:has(.time) {
    grid-template-columns: 0.8fr 1.4fr 1fr 1.1fr;
  }
  select {
    width: 100%;
    min-height: var(--control-h);
    padding: 0 var(--space-sm);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    font-size: var(--fs-md);
    font-family: inherit;
  }
  select:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  .invalid select {
    border-color: var(--color-error);
  }
  .msg {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--color-error);
    font-size: var(--fs-sm);
  }
  @media (max-width: 480px) {
    .row:has(.time) {
      grid-template-columns: 1fr 1.5fr 1fr;
    }
    .time {
      grid-column: 1 / -1;
    }
  }
</style>
