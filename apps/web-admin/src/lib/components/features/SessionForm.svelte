<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SessionInput } from '$lib/api';
  import { normalizeSession, validateSession } from '$lib/utils/sessionForm';
  import Button from '$lib/components/ui/Button.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import TextAreaField from '$lib/components/ui/TextAreaField.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ScheduleFields from './ScheduleFields.svelte';

  interface Props {
    initial: SessionInput;
    submitLabel: string;
    busy?: boolean;
    /** فقط‌خواندنی (جلسهٔ شروع‌شده/حذف‌شده یا بدون مجوز) */
    readonly?: boolean;
    /** خطاهای سرور (کلیدها مثل فرم) */
    serverErrors?: Record<string, string>;
    formError?: string | null;
    onsubmit: (input: SessionInput) => void;
    oncancel?: () => void;
    /** فیلد اضافه بالای فرم (مثلاً انتخاب سازنده) */
    top?: Snippet;
  }
  let { initial, submitLabel, busy = false, readonly = false, serverErrors = {}, formError = null, onsubmit, oncancel, top }: Props = $props();

  // مقدار اولیه عمداً یک‌بار گرفته می‌شود (فرم ویرایشی)
  /* svelte-ignore state_referenced_locally */
  let title = $state(initial.title);
  /* svelte-ignore state_referenced_locally */
  let description = $state(initial.description);
  /* svelte-ignore state_referenced_locally */
  let label = $state(initial.location.label);
  /* svelte-ignore state_referenced_locally */
  let routeUrl = $state(initial.location.routeUrl ?? '');
  /* svelte-ignore state_referenced_locally */
  let schedule = $state(initial.schedule);
  let clientErrors = $state<Record<string, string>>({});
  const errors = $derived({ ...serverErrors, ...clientErrors });
  const locked = $derived(busy || readonly);

  function build(): SessionInput {
    return { title, description, location: { label, routeUrl: routeUrl.trim() || null }, schedule };
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const v = build();
    clientErrors = validateSession(v);
    if (Object.keys(clientErrors).length) return;
    onsubmit(normalizeSession(v));
  }
</script>

<form class="form" onsubmit={submit} novalidate>
  {#if top}{@render top()}{/if}
  <TextField label="عنوان جلسه" bind:value={title} error={errors.title} disabled={locked} required maxlength={80} />
  <TextAreaField label="توضیحات" bind:value={description} error={errors.description} disabled={locked} required maxlength={500} hint="۱۰ تا ۵۰۰ نویسه." />
  <TextField label="مکان" bind:value={label} error={errors.location} hint="آدرس متنی؛ مثلاً «آنلاین» یا نام سالن، خیابان و شهر." disabled={locked} required maxlength={120} />
  <TextField label="لینک مسیریابی (اختیاری)" bind:value={routeUrl} error={errors['location.routeUrl']} hint="لینک مکان از نشان، بلد یا گوگل‌مپ؛ باید با https شروع شود." type="text" inputmode="text" ltr disabled={locked} maxlength={500} />
  <ScheduleFields {schedule} {errors} disabled={locked} onchange={(s) => (schedule = s)} />

  {#if formError}<NoticeBanner tone="error" role="alert">{formError}</NoticeBanner>{/if}

  {#if !readonly}
    <p class="muted fa-small"><span>ذخیره نیازمند تأیید هویت با کد پیامکی است.</span></p>
    <div class="acts">
      <Button type="submit" loading={busy}>{submitLabel}</Button>
      {#if oncancel}<Button variant="text" disabled={busy} onclick={oncancel}>انصراف</Button>{/if}
    </div>
  {/if}
</form>

<style>
  .form {
    display: grid;
    gap: var(--space-lg);
    max-width: 42rem;
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
  }
</style>
