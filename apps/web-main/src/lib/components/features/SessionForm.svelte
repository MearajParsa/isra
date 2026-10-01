<script lang="ts">
  import type { SessionInput } from '$lib/api/mid-types';
  import Button from '$lib/components/ui/Button.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ScheduleFields from './ScheduleFields.svelte';

  interface Props {
    initial: SessionInput;
    submitLabel: string;
    busy?: boolean;
    errors?: Record<string, string>;
    formError?: string | null;
    onsubmit: (input: SessionInput) => void;
    cancelHref: string;
  }
  let { initial, submitLabel, busy = false, errors = {}, formError = null, onsubmit, cancelHref }: Props = $props();

  // مقدار اولیهٔ فرم عمداً یک‌بار گرفته می‌شود
  /* svelte-ignore state_referenced_locally */
  let title = $state(initial.title);
  /* svelte-ignore state_referenced_locally */
  let description = $state(initial.description);
  /* svelte-ignore state_referenced_locally */
  let location = $state(initial.location.label);
  /* svelte-ignore state_referenced_locally */
  let schedule = $state(initial.schedule);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    onsubmit({ title, description, location: { label: location }, schedule });
  }
</script>

<form class="form" onsubmit={submit} novalidate>
  <TextField label="عنوان جلسه" bind:value={title} error={errors.title} disabled={busy} required maxlength={80} />

  <div class="field">
    <label for="desc">توضیحات <span class="req" aria-hidden="true">*</span></label>
    <textarea id="desc" rows="4" maxlength="500" bind:value={description} disabled={busy} aria-invalid={!!errors.description}></textarea>
    {#if errors.description}<p class="err" role="alert">{errors.description}</p>{/if}
  </div>

  <TextField
    label="مکان"
    bind:value={location}
    error={errors.location}
    hint="مثلاً «آنلاین» یا نام سالن و شهر؛ نقشه بعداً اضافه می‌شود."
    disabled={busy}
    required
    maxlength={120}
  />

  <ScheduleFields {schedule} {errors} disabled={busy} onchange={(s) => (schedule = s)} />

  {#if formError}<NoticeBanner tone="error" role="alert">{formError}</NoticeBanner>{/if}

  <div class="acts">
    <Button type="submit" loading={busy}>{submitLabel}</Button>
    <Button variant="text" href={cancelHref} disabled={busy}>انصراف</Button>
  </div>
</form>

<style>
  .form {
    display: grid;
    gap: var(--space-lg);
    max-width: 40rem;
  }
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
  }
  textarea:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  textarea[aria-invalid='true'] {
    border-color: var(--color-error);
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
