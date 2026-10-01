<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';

  interface Props {
    title: string;
    message: string;
  }
  let { title, message }: Props = $props();
  const loginHref = $derived(`/auth/phone?next=${encodeURIComponent(page.url.pathname)}`);
</script>

<EmptyState icon="lock" {title} {message}>
  {#snippet action()}
    <Button href={loginHref}>ورود / ثبت‌نام</Button>
  {/snippet}
</EmptyState>
