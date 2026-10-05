<script lang="ts">
  import { api, type SystemUser } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { formatPhone } from '$lib/utils/phone';
  import { isDeletedPhone } from '$lib/utils/labels';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    label: string;
    /** شناسهٔ کاربر انتخاب‌شده ('' = هیچ) */
    valueId: string;
    onchange: (id: string, user: SystemUser | null) => void;
    placeholder?: string;
    disabled?: boolean;
  }
  let { label, valueId, onchange, placeholder = 'نام یا شمارهٔ کاربر', disabled = false }: Props = $props();

  const uid = $props.id();
  let selected = $state<{ id: string; name: string } | null>(null);
  let text = $state('');
  let results = $state<SystemUser[]>([]);
  let open = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let active = $state(-1);
  let ctl: AbortController | null = null;

  // نام کاربرِ انتخاب‌شده از URL (اشتراک‌گذاری) را بازیابی می‌کند
  $effect(() => {
    const id = valueId;
    if (!id) {
      selected = null;
      return;
    }
    if (selected?.id === id) return;
    selected = { id, name: '…' };
    const c = new AbortController();
    void auth
      .withAuth((t) => api.system.user(t, id, { signal: c.signal }))
      .then((u) => {
        if (valueId === id) selected = { id, name: u.name || 'کاربر حذف‌شده' };
      })
      .catch(() => {
        if (valueId === id && !c.signal.aborted) selected = { id, name: `شناسه ${id.slice(0, 8)}` };
      });
    return () => c.abort();
  });

  $effect(() => {
    const q = text.trim();
    if (!open) return;
    const t = setTimeout(async () => {
      ctl?.abort();
      const c = (ctl = new AbortController());
      loading = true;
      failed = false;
      try {
        const r = await auth.withAuth((tk) => api.system.users(tk, { q, pageSize: 8, sort: 'name' }, { signal: c.signal }));
        if (c.signal.aborted) return;
        results = r.items;
        active = r.items.length ? 0 : -1;
      } catch {
        if (!c.signal.aborted) {
          failed = true;
          results = [];
        }
      } finally {
        if (!c.signal.aborted) loading = false;
      }
    }, 250);
    return () => clearTimeout(t);
  });

  function pick(u: SystemUser) {
    selected = { id: u.id, name: u.name || 'کاربر حذف‌شده' };
    text = '';
    open = false;
    onchange(u.id, u);
  }
  function clear() {
    selected = null;
    text = '';
    onchange('', null);
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open = true;
      active = Math.min(results.length - 1, active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      pick(results[active]!);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      open = false;
    }
  }
</script>

<div class="picker">
  <label for={`up-${uid}`}>{label}</label>
  {#if selected}
    <div class="sel">
      <span class="name">{selected.name}</span>
      <button type="button" class="x" {disabled} onclick={clear} aria-label={`حذف انتخاب ${label}`}><Icon name="x" size={18} /></button>
    </div>
  {:else}
    <input
      id={`up-${uid}`}
      type="search"
      role="combobox"
      autocomplete="off"
      aria-expanded={open}
      aria-controls={`lb-${uid}`}
      aria-autocomplete="list"
      aria-activedescendant={open && active >= 0 ? `op-${uid}-${active}` : undefined}
      {placeholder}
      {disabled}
      bind:value={text}
      onfocus={() => (open = true)}
      onblur={() => setTimeout(() => (open = false), 150)}
      onkeydown={key}
    />
    {#if open}
      <ul class="list" id={`lb-${uid}`} role="listbox" aria-label={`نتایج ${label}`}>
        {#if loading}
          <li class="note" role="presentation">در حال جست‌وجو…</li>
        {:else if failed}
          <li class="note err" role="presentation">جست‌وجو ممکن نشد.</li>
        {:else if results.length === 0}
          <li class="note" role="presentation">کاربری پیدا نشد.</li>
        {:else}
          {#each results as u, i (u.id)}
            <li id={`op-${uid}-${i}`} role="option" aria-selected={i === active} class:on={i === active}>
              <button type="button" tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => pick(u)}>
                <strong>{u.name || 'کاربر حذف‌شده'}</strong>
                <span class="muted" dir="ltr">{isDeletedPhone(u.phone) ? '—' : formatPhone(u.phone)}</span>
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .picker {
    position: relative;
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  label {
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  input {
    width: 100%;
    min-height: var(--control-h);
    padding: 0 var(--space-md);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    font-size: var(--fs-md);
  }
  input:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  .sel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    min-height: var(--control-h);
    padding: 0 var(--space-sm) 0 var(--space-md);
    background: var(--color-primary-tint);
    border: 1.5px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
    border-radius: var(--radius-md);
  }
  .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
  }
  .x:hover {
    background: var(--color-secondary);
  }
  .list {
    position: absolute;
    inset-inline: 0;
    top: calc(100% + 4px);
    z-index: 30;
    max-height: 18rem;
    overflow: auto;
    padding: 4px;
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    box-shadow: var(--elev-2);
  }
  li button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    width: 100%;
    min-height: 44px;
    padding: 4px 12px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: start;
  }
  li.on button,
  li button:hover {
    background: var(--color-primary-tint);
  }
  .note {
    padding: 10px 12px;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .note.err {
    color: var(--color-error);
  }
</style>
