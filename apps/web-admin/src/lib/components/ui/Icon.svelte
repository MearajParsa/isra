<script module lang="ts">
  const paths = {
    home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5',
    calendar: 'M4 6.5h16v13H4zM4 10.5h16M8 3.5v4M16 3.5v4',
    bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5',
    award: 'M12 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8.5 14l-1.5 6.5 5-2.5 5 2.5-1.5-6.5',
    lock: 'M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    phone: 'M8 3.5h8A1.5 1.5 0 0 1 17.5 5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5zM11 17.5h2',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6 6 18',
    'chevron-left': 'M14.5 6l-6 6 6 6',
    'chevron-right': 'M9.5 6l6 6-6 6',
    'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    pin: 'M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    logout: 'M10 4.5H5.5v15H10M14 8l4 4-4 4M18 12H9.5',
    monitor: 'M3.5 5h17v11h-17zM9 20h6M12 16v4',
    shield: 'M12 3.5l7 2.5v5.5c0 4.3-3 7.7-7 9-4-1.3-7-4.7-7-9V6z',
    refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
    'wifi-off': 'M3 3l18 18M5.5 9.7a11 11 0 0 1 3-1.7M12 5.5a14 14 0 0 1 8 3M9 13.3a6 6 0 0 1 3-.8M12 18.5h.01',
    alert: 'M12 4 3 19.5h18zM12 10v4.5M12 17h.01',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
    book: 'M4 5.5C6 4.5 9 4.3 12 6c3-1.7 6-1.5 8-.5v13c-2-1-5-1.2-8 .5-3-1.7-6-1.5-8-.5zM12 6v13',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    'eye-off': 'M3 3l18 18M10 6a8.7 8.7 0 0 1 2-.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 3.9M6.3 7.6A15.7 15.7 0 0 0 2.5 12S6 18.5 12 18.5a8.7 8.7 0 0 0 3.4-.7M9.9 10a2.5 2.5 0 0 0 3.5 3.5',
    users: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 19.5c.6-3 3.1-4.5 6.5-4.5s5.9 1.5 6.5 4.5M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.2c1.8.6 3 2 3.5 4.3',
    mic: 'M12 14.5a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5.5a3 3 0 0 0 3 3zM6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5',
    sparkles: 'M12 4l1.8 4.7 4.7 1.8-4.7 1.8L12 17l-1.8-4.7-4.7-1.8 4.7-1.8zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
    download: 'M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14',
    share: 'M12 15V4M8 7.5l4-4 4 4M7 11H5.5v9h13v-9H17',
    plus: 'M12 5v14M5 12h14',
    mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    key: 'M14.5 10.5a4.5 4.5 0 1 0-8.2 2.6 4.5 4.5 0 0 0 8.2-2.6zM13.5 13.5 20 20M17 17l2-2',
    'chevron-down': 'M6 9l6 6 6-6',
    chart: 'M4 20V9M10 20V4M16 20v-8M22 20H2M4 5.5l0 0',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    trash: 'M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v6M14 11v6',
    ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
    filter: 'M4 5h16l-6 7.5V19l-4-2v-4.5z'
  } as const;

  export type IconName = keyof typeof paths;
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
    class?: string;
  }
  let { name, size = 24, class: klass = '' }: Props = $props();
</script>

<svg
  class={klass}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <path d={paths[name]} />
</svg>
