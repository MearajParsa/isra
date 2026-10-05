<script lang="ts">
  import { JALALI_MONTHS, gregorianStringToJalali, jalaliMonthLength, jalaliToGregorianString, toJalali } from '$lib/utils/jalali';
  import { formatPlain } from '$lib/utils/format';
  import Icon from './Icon.svelte';
  import TimeField from './TimeField.svelte';

  interface Props {
    label: string;
    /** مقدار میلادی به وقت تهران: `YYYY-MM-DD` یا (با withTime) `YYYY-MM-DDTHH:mm`؛ '' = خالی (فقط با clearable) */
    value: string;
    withTime?: boolean;
    /** فیلتر اختیاری: امکان خالی‌گذاشتن و دکمهٔ پاک‌کردن */
    clearable?: boolean;
    error?: string | null;
    disabled?: boolean;
    onchange: (value: string) => void;
  }
  let { label, value, withTime = false, clearable = false, error = null, disabled = false, onchange }: Props = $props();

  const now = new Date();
  const today = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // اجزای انتخاب‌شده (در حالت clearable ممکن است ناقص باشند)
  let jy = $state(0);
  let jm = $state(0);
  let jd = $state(0);
  $effect(() => {
    const j = gregorianStringToJalali(value);
    if (j) {
      jy = j.jy;
      jm = j.jm;
      jd = j.jd;
    } else if (!clearable) {
      jy = today.jy;
      jm = today.jm;
      jd = today.jd;
    } else if (value === '') {
      // خالی شدن از بیرون (پاک‌کردن فیلتر) ⇒ اجزا هم خالی؛ انتخاب ناقص کاربر را دست نمی‌زنیم
      if (jy && jm && jd) jy = jm = jd = 0;
    }
  });

  const time = $derived(withTime && value.length >= 16 ? value.slice(11, 16) : '00:00');
  const years = $derived.by(() => {
    const base = Array.from({ length: 9 }, (_, i) => today.jy - 4 + i);
    return jy && !base.includes(jy) ? [...base, jy].sort((a, b) => a - b) : base;
  });
  const days = $derived(Array.from({ length: jalaliMonthLength(jy || today.jy, jm || 1) }, (_, i) => i + 1));

  function commit(t: string) {
    if (jy && jm && jd) {
      const d = Math.min(jd, jalaliMonthLength(jy, jm));
      const date = jalaliToGregorianString(jy, jm, d);
      onchange(withTime ? `${date}T${t || '00:00'}` : date);
    } else if (clearable) onchange('');
  }
  function setPart(part: 'y' | 'm' | 'd', v: number) {
    if (part === 'y') jy = v;
    else if (part === 'm') jm = v;
    else jd = v;
    // با پر شدن سال و ماه، روز نامعتبر کوتاه می‌شود
    if (jy && jm && jd > jalaliMonthLength(jy, jm)) jd = jalaliMonthLength(jy, jm);
    commit(time);
  }
  function clear() {
    jy = jm = jd = 0;
    onchange('');
  }
</script>

<fieldset class="jf" class:invalid={!!error} {disabled}>
  <legend>{label}</legend>
  <div class="row" class:t={withTime}>
    <select aria-label={`${label} — روز`} value={jd} onchange={(e) => setPart('d', Number(e.currentTarget.value))}>
      {#if clearable}<option value={0}>روز</option>{/if}
      {#each days as d (d)}<option value={d}>{formatPlain(d)}</option>{/each}
    </select>
    <select aria-label={`${label} — ماه`} value={jm} onchange={(e) => setPart('m', Number(e.currentTarget.value))}>
      {#if clearable}<option value={0}>ماه</option>{/if}
      {#each JALALI_MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
    </select>
    <select aria-label={`${label} — سال`} value={jy} onchange={(e) => setPart('y', Number(e.currentTarget.value))}>
      {#if clearable}<option value={0}>سال</option>{/if}
      {#each years as y (y)}<option value={y}>{formatPlain(y)}</option>{/each}
    </select>
    {#if withTime}
      <div class="time"><TimeField {label} value={time} {disabled} onchange={(t) => commit(t)} /></div>
    {/if}
    {#if clearable && (jy || jm || jd)}
      <button type="button" class="clr" onclick={clear} aria-label={`پاک‌کردن ${label}`}><Icon name="x" size={18} /></button>
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
    position: relative;
    display: grid;
    grid-template-columns: 0.8fr 1.4fr 1fr;
    gap: var(--space-sm);
  }
  .row.t {
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
  }
  select:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  .invalid select {
    border-color: var(--color-error);
  }
  .clr {
    position: absolute;
    inset-block-start: -34px;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
  }
  .clr:hover {
    background: var(--color-secondary);
  }
  .msg {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-error);
    font-size: var(--fs-sm);
  }
  @media (max-width: 480px) {
    .row.t {
      grid-template-columns: 1fr 1.5fr 1fr;
    }
    .time {
      grid-column: 1 / -1;
    }
  }
</style>
