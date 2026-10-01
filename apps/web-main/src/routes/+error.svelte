<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';

  const status = $derived(page.status);
  const view = $derived.by((): { icon: IconName; title: string; message: string } => {
    if (status === 404)
      return { icon: 'info', title: 'صفحه‌ای پیدا نشد', message: 'نشانی را بررسی کنید یا به صفحهٔ اول برگردید.' };
    if (status === 403)
      return { icon: 'lock', title: 'به این بخش دسترسی ندارید', message: 'اگر فکر می‌کنید اشتباهی رخ داده، دوباره وارد شوید.' };
    if (status === 503)
      return { icon: 'refresh', title: 'در حال نگهداری هستیم', message: 'سرویس لحظاتی در دسترس نیست. کمی بعد دوباره سر بزنید.' };
    return { icon: 'alert', title: 'مشکلی پیش آمد', message: 'دوباره تلاش کنید. اگر ادامه داشت، کمی بعد برگردید.' };
  });
</script>

<svelte:head><title>{view.title} — اسراء</title></svelte:head>

<div class="container">
  <EmptyState icon={view.icon} title={view.title} message={view.message} tone={status >= 500 ? 'error' : 'neutral'}>
    {#snippet action()}
      <Button href="/">صفحهٔ اول</Button>
      {#if status >= 500}<Button variant="secondary" onclick={() => location.reload()}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/if}
    {/snippet}
  </EmptyState>
</div>
