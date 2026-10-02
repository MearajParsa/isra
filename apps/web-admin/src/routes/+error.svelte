<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';

  const notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'صفحه پیدا نشد' : 'خطا'} — مدیریت اسراء</title></svelte:head>

<EmptyState
  icon={notFound ? 'info' : 'alert'}
  tone={notFound ? 'neutral' : 'error'}
  title={notFound ? 'صفحه‌ای پیدا نشد' : 'مشکلی پیش آمد'}
  message={notFound ? 'نشانی را بررسی کنید یا به نمای کلی برگردید.' : 'دوباره تلاش کنید. اگر ادامه داشت، کمی بعد برگردید.'}
>
  {#snippet action()}<Button href="/">نمای کلی</Button>{/snippet}
</EmptyState>
