<script lang="ts">
  import type { EvaluationInput, EvaluationWeights } from '$lib/api/mid-types';
  import { formatNumber } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import ScoreSlider from '$lib/components/ui/ScoreSlider.svelte';

  interface Props {
    name: string;
    weights: EvaluationWeights;
    busy?: boolean;
    errors?: Record<string, string>;
    onsubmit: (input: Omit<EvaluationInput, 'queueItemId'>) => void;
    oncancel: () => void;
  }
  let { name, weights, busy = false, errors = {}, onsubmit, oncancel }: Props = $props();

  let voice = $state(5);
  let tone = $state(5);
  let tajweed = $state(5);
  let note = $state('');

  const sum = $derived(weights.voice + weights.tone + weights.tajweed);
  const score = $derived(Math.round(((voice * weights.voice + tone * weights.tone + tajweed * weights.tajweed) / sum) * 10));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    onsubmit({ voice, tone, tajweed, note: note.trim() || undefined });
  }
</script>

<form class="form" onsubmit={submit}>
  <h3>ارزیابی قرائت «{name}»</h3>
  <ScoreSlider label="صوت" weight={weights.voice} bind:value={voice} error={errors.voice} disabled={busy} />
  <ScoreSlider label="لحن" weight={weights.tone} bind:value={tone} error={errors.tone} disabled={busy} />
  <ScoreSlider label="تجوید" weight={weights.tajweed} bind:value={tajweed} error={errors.tajweed} disabled={busy} />

  <div class="total" aria-live="polite">
    <span>امتیاز کل (وزن‌دار)</span>
    <strong>{formatNumber(score)}<small>از ۱۰۰</small></strong>
  </div>

  <div class="field">
    <label for="ev-note">یادداشت (اختیاری)</label>
    <textarea id="ev-note" rows="3" maxlength="300" bind:value={note} disabled={busy} placeholder="بازخورد کوتاه برای قرآن‌آموز"></textarea>
    {#if errors.note}<p class="err" role="alert">{errors.note}</p>{/if}
  </div>

  <div class="acts">
    <Button type="submit" loading={busy}>ثبت ارزیابی</Button>
    <Button variant="text" disabled={busy} onclick={oncancel}>انصراف</Button>
  </div>
</form>

<style>
  .form {
    display: grid;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
  .total strong {
    font-size: var(--fs-xxl);
    color: var(--color-accent-warm);
  }
  .total small {
    font-size: var(--fs-sm);
    margin-inline-start: 2px;
    color: var(--color-on-primary);
  }
  .field {
    display: grid;
    gap: 6px;
  }
  label {
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    resize: vertical;
  }
  textarea:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  .err {
    color: var(--color-error);
    font-size: var(--fs-sm);
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
  }
</style>
