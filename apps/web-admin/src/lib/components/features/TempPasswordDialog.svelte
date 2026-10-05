<script lang="ts">
  import { api } from '$lib/api';
  import { toasts } from '$lib/stores/toast.svelte';
  import { stepped, describeError } from '$lib/utils/adminCall';
  import { passwordError } from '$lib/utils/password';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import PasswordGenerator from './PasswordGenerator.svelte';
  import SecretReveal from './SecretReveal.svelte';

  interface Props {
    open?: boolean;
    userId: string;
    userName: string;
    ondone?: () => void;
  }
  let { open = $bindable(false), userId, userName, ondone }: Props = $props();

  let password = $state('');
  let error = $state<string | null>(null);
  let fieldError = $state<string | null>(null);
  let busy = $state(false);
  let done = $state<string | null>(null);

  $effect(() => {
    if (open) {
      password = '';
      error = fieldError = null;
      done = null;
    }
  });

  async function save() {
    fieldError = passwordError(password);
    if (fieldError) return;
    busy = true;
    error = null;
    try {
      const r = await stepped((t, su) => api.system.setUserPassword(t, userId, { action: 'set', password }, su).then(() => true));
      if (!r) return;
      done = password;
      toasts.success('رمز موقت تعیین شد و کاربر از همهٔ دستگاه‌ها خارج شد.');
      ondone?.();
    } catch (e) {
      error = describeError(e);
    } finally {
      busy = false;
    }
  }
</script>

<Sheet bind:open title="تعیین رمز موقت" dismissible={!busy}>
  {#if done}
    <SecretReveal secret={done} />
    <NoticeBanner tone="warning">این رمز فقط همین یک بار نمایش داده می‌شود. آن را به «{userName}» برسانید؛ او باید در اولین ورود رمز را عوض کند.</NoticeBanner>
    <Button onclick={() => (open = false)} full>بستن</Button>
  {:else}
    <NoticeBanner tone="info">با تعیین رمز موقت، «{userName}» از همهٔ دستگاه‌ها خارج می‌شود و در ورود بعدی باید رمز جدید بسازد.</NoticeBanner>
    <PasswordGenerator bind:value={password} error={fieldError} disabled={busy} />
    {#if error}<NoticeBanner tone="error" role="alert">{error}</NoticeBanner>{/if}
    <div class="acts">
      <Button loading={busy} onclick={save} full>تعیین رمز</Button>
      <Button variant="secondary" disabled={busy} onclick={() => (open = false)} full>انصراف</Button>
    </div>
  {/if}
</Sheet>

<style>
  .acts {
    display: grid;
    gap: var(--space-sm);
  }
  @media (min-width: 640px) {
    .acts {
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
    }
  }
</style>
