<script lang="ts">
  import { page } from '$app/state';
  import { gate } from '$lib/stores/gate.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  const next = $derived(gate.next ?? page.url.pathname + page.url.search);
  const loginHref = $derived(`/auth/phone?next=${encodeURIComponent(next)}`);
</script>

<Sheet bind:open={gate.isOpen} title="برای ادامه وارد شوید">
  <div class="gate">
    <span class="ico"><Icon name="lock" size={28} /></span>
    <p>{gate.reason}</p>
    <p class="muted small">ورود و ثبت‌نام فقط با شمارهٔ موبایل و کد پیامکی انجام می‌شود.</p>
  </div>
  {#snippet footer()}
    <Button href={loginHref} onclick={() => gate.close()} full>ورود / ثبت‌نام</Button>
    <Button variant="secondary" onclick={() => gate.close()} full>فعلاً نه</Button>
  {/snippet}
</Sheet>

<style>
  .gate {
    display: grid;
    justify-items: center;
    gap: var(--space-sm);
    text-align: center;
  }
  .ico {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .small {
    font-size: var(--fs-sm);
  }
</style>
