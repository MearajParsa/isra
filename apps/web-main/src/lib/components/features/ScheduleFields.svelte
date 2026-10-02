<script lang="ts">
  import type { SessionSchedule } from '$lib/api/types';
  import { WEEKDAYS, fromTehranInput, scheduleLabel, toTehranDateInput, toTehranInput } from '$lib/utils/format';
  import TextField from '$lib/components/ui/TextField.svelte';
  import TimeField from '$lib/components/ui/TimeField.svelte';
  import JalaliDateField from '$lib/components/ui/JalaliDateField.svelte';

  interface Props {
    schedule: SessionSchedule;
    errors?: Record<string, string>;
    disabled?: boolean;
    onchange: (s: SessionSchedule) => void;
  }
  let { schedule, errors = {}, disabled = false, onchange }: Props = $props();

  const kind = $derived(schedule.type);

  function iso(offsetDays: number, hh: number) {
    const d = new Date(Date.now() + offsetDays * 86_400_000);
    d.setUTCHours(hh - 3, 30, 0, 0);
    return d.toISOString();
  }

  function switchKind(k: SessionSchedule['type']) {
    if (k === schedule.type) return;
    if (k === 'once') onchange({ type: 'once', startsAt: iso(7, 18), endsAt: iso(7, 19) });
    else if (k === 'recurring') onchange({ type: 'recurring', weekdays: [4], timeOfDay: '18:00', durationMin: 60 });
    else onchange({ type: 'range', rangeFrom: iso(7, 0), rangeTo: iso(60, 0), weekdays: [4], timeOfDay: '18:00', durationMin: 60 });
  }

  /** تغییر شروع: مدت قبلی حفظ می‌شود تا «پایان» هرگز قبل از «شروع» نماند (حداقل ۱۵ دقیقه) */
  function changeStart(startsAt: string) {
    if (schedule.type !== 'once' || !startsAt) return;
    const oldDur = Date.parse(schedule.endsAt) - Date.parse(schedule.startsAt);
    const dur = Number.isFinite(oldDur) && oldDur >= 15 * 60_000 ? oldDur : 60 * 60_000;
    onchange({ ...schedule, startsAt, endsAt: new Date(Date.parse(startsAt) + dur).toISOString() });
  }

  function toggleDay(d: number) {
    if (schedule.type === 'once') return;
    const has = schedule.weekdays.includes(d);
    const weekdays = has ? schedule.weekdays.filter((x) => x !== d) : [...schedule.weekdays, d].sort((a, b) => a - b);
    onchange({ ...schedule, weekdays });
  }

  const kinds: { v: SessionSchedule['type']; l: string }[] = [
    { v: 'once', l: 'یک‌باره' },
    { v: 'recurring', l: 'تکرارشونده' },
    { v: 'range', l: 'بازهٔ محدود' }
  ];

  const preview = $derived.by(() => {
    try {
      return scheduleLabel(schedule);
    } catch {
      return '';
    }
  });
</script>

<fieldset class="set" {disabled}>
  <legend>زمان‌بندی (به وقت تهران)</legend>

  <div class="kinds" role="radiogroup" aria-label="نوع زمان‌بندی">
    {#each kinds as k (k.v)}
      <button type="button" role="radio" aria-checked={kind === k.v} class="kind" class:on={kind === k.v} onclick={() => switchKind(k.v)}>
        {k.l}
      </button>
    {/each}
  </div>

  {#if schedule.type === 'once'}
    <div class="grid">
      <JalaliDateField label="شروع" withTime value={toTehranInput(schedule.startsAt)} error={errors.startsAt} {disabled} onchange={(v) => changeStart(fromTehranInput(v))} />
      <JalaliDateField label="پایان" withTime value={toTehranInput(schedule.endsAt)} error={errors.endsAt} {disabled} onchange={(v) => onchange({ ...schedule, endsAt: fromTehranInput(v) })} />
    </div>
  {:else}
    <div class="days">
      <span class="lbl" id="days-l">روزهای هفته (شنبه تا جمعه)</span>
      <div class="chips" role="group" aria-labelledby="days-l">
        {#each WEEKDAYS as w, d (d)}
          <button type="button" class="day" class:on={schedule.weekdays.includes(d)} aria-pressed={schedule.weekdays.includes(d)} onclick={() => toggleDay(d)}>
            {w}
          </button>
        {/each}
      </div>
      {#if errors.weekdays}<p class="err" role="alert">{errors.weekdays}</p>{/if}
    </div>
    <div class="grid">
      <div class="tf">
        <span class="lbl">ساعت شروع</span>
        <TimeField label="ساعت شروع" value={schedule.timeOfDay} {disabled} onchange={(v) => onchange({ ...schedule, timeOfDay: v })} />
        {#if errors.timeOfDay}<p class="err" role="alert">{errors.timeOfDay}</p>{/if}
      </div>
      <TextField
        label="مدت (دقیقه)"
        type="number"
        inputmode="numeric"
        ltr
        value={String(schedule.durationMin)}
        error={errors.durationMin}
        oninput={(e) => onchange({ ...schedule, durationMin: Number((e.currentTarget as HTMLInputElement).value) })}
      />
    </div>
    {#if schedule.type === 'range'}
      <div class="grid">
        <JalaliDateField label="از تاریخ" value={toTehranDateInput(schedule.rangeFrom)} error={errors.rangeFrom} {disabled} onchange={(v) => onchange({ ...schedule, rangeFrom: fromTehranInput(v) })} />
        <JalaliDateField label="تا تاریخ" value={toTehranDateInput(schedule.rangeTo)} error={errors.rangeTo} {disabled} onchange={(v) => onchange({ ...schedule, rangeTo: fromTehranInput(v) })} />
      </div>
    {/if}
  {/if}

  {#if preview && Object.keys(errors).length === 0}
    <p class="preview"><strong>پیش‌نمایش:</strong> {preview}</p>
  {/if}
</fieldset>

<style>
  .set {
    display: grid;
    gap: var(--space-md);
    min-width: 0;
    margin: 0;
    padding: var(--space-md);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  legend {
    padding-inline: var(--space-sm);
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .kinds {
    display: flex;
    gap: var(--space-xs);
    padding: 4px;
    background: var(--color-neutral);
    border-radius: var(--radius-md);
  }
  .kind {
    flex: 1;
    min-height: 44px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    font-weight: 700;
    color: var(--color-muted);
  }
  .kind.on {
    background: var(--color-card);
    color: var(--color-primary);
    box-shadow: var(--elev-1);
  }
  .tf {
    display: grid;
    gap: 6px;
  }
  .grid {
    display: grid;
    gap: var(--space-md);
  }
  .lbl {
    display: block;
    margin-bottom: 6px;
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }
  .day {
    min-height: 40px;
    padding: 0 14px;
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-pill);
    background: var(--color-card);
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-primary);
  }
  .day.on {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-on-primary);
  }
  .err {
    color: var(--color-error);
    font-size: var(--fs-sm);
    margin-top: 4px;
  }
  .preview {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    background: var(--color-accent-tint);
    font-size: var(--fs-sm);
  }
  @media (min-width: 560px) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
