import type { Theme } from '../core/storage.ts';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Контурні значки 24×24 (лінія 2 px, заокруглені кінці) — однаковий стиль для всіх кнопок.
 * Кожен шлях — окремий атрибут `d`; `fill` — зафарбовані частини.
 */
const ICONS = {
  play: { d: 'M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8z' },
  resume: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM10 8.8v6.4l5.2-3.2z' },
  hard: { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01' },
  star: { d: 'M12 2.8l2.8 5.7 6.3.9-4.55 4.45 1.07 6.27L12 17.15l-5.62 2.97 1.07-6.27L2.9 9.4l6.3-.9z' },
  starFilled: {
    d: 'M12 2.8l2.8 5.7 6.3.9-4.55 4.45 1.07 6.27L12 17.15l-5.62 2.97 1.07-6.27L2.9 9.4l6.3-.9z',
    fill: true,
  },
  ban: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM5.6 5.6l12.8 12.8' },
  trash: {
    d: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7',
  },
  exam: {
    d: 'M9 3.5h6v3H9zM9 5H6.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H15M9 14l2 2 4-4.5',
  },
  sparkles: {
    d: 'M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z',
  },
  download: { d: 'M12 3.5v11.5M7 10.5l5 5 5-5M5 20.5h14' },
  back: { d: 'M19 12H5M11 18l-6-6 6-6' },
  next: { d: 'M5 12h14M13 6l6 6-6 6' },
  eye: { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z' },
  eyeOff: {
    d: 'M3 3l18 18M10.6 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.6M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.9-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2',
  },
  close: { d: 'M18 6 6 18M6 6l12 12' },
  check: { d: 'M20 6.5 9 17.5l-5-5' },
  submit: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8 12.2l2.8 2.8L16 9.5' },
  skip: { d: 'M5 5.5v13l9.5-6.5zM18.5 5.5v13' },
  flag: { d: 'M5 21.5V4M5 4h12.5l-2.2 4.25L17.5 12.5H5' },
  undo: { d: 'M9 14.5 4 9.5l5-5M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11' },
  again: { d: 'M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 3.5v5h5' },
  retry: { d: 'M17 2.5l3.5 3.5-3.5 3.5M3.5 11v-1A4 4 0 0 1 7.5 6h13M7 21.5 3.5 18 7 14.5M20.5 13v1a4 4 0 0 1-4 4h-13' },
  home: { d: 'M3.5 10.5 12 3.5l8.5 7M5.5 9v11a1 1 0 0 0 1 1h3.5v-6h4v6h3.5a1 1 0 0 0 1-1V9' },
  minus: { d: 'M5 12h14' },
  plus: { d: 'M12 5v14M5 12h14' },
  book: { d: 'M4 19V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5M8 7h8' },
  layers: { d: 'M12 2.5 2.5 7.5l9.5 5 9.5-5zM2.5 12l9.5 5 9.5-5M2.5 16.5l9.5 5 9.5-5' },
  cards: { d: 'M8 3.5h10a2 2 0 0 1 2 2V17M4 8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' },
  choice: { d: 'M3.5 6.5l1.75 1.75L8.5 5M3.5 13.5l1.75 1.75L8.5 12M11.5 6.5h9M11.5 13.5h9M11.5 19.5h9M4.5 19.5h2' },
  target: {
    d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 11.2a.8.8 0 1 0 0 1.6a.8.8 0 1 0 0-1.6z',
  },
  feather: { d: 'M20 12.2a6 6 0 0 0-8.5-8.5L5 10.2V19h8.8zM16 8 3 21M17.5 15.5H9' },
  // Тема: «як у системі» — коло з зафарбованою лівою половиною.
  themeSystem: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 3v18', fillD: 'M12 3a9 9 0 0 0 0 18z' },
  themeLight: {
    d: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  themeDark: { d: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z' },
} as const satisfies Record<string, { d: string; fill?: boolean; fillD?: string }>;

export type IconName = keyof typeof ICONS;

export const THEME_ICON: Readonly<Record<Theme, IconName>> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
};

/** Значок для кнопки: декоративний (`aria-hidden`), назву кнопки дає текст або `aria-label`. */
export function icon(name: IconName, size = 18): SVGSVGElement {
  const def: { d: string; fill?: boolean; fillD?: string } = ICONS[name];
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({
    class: 'icon',
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    'aria-hidden': 'true',
    focusable: 'false',
    fill: def.fill ? 'currentColor' : 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'data-icon': name,
  }))
    svg.setAttribute(k, v);
  if (def.fillD) {
    const half = document.createElementNS(SVG, 'path');
    half.setAttribute('d', def.fillD);
    half.setAttribute('fill', 'currentColor');
    svg.appendChild(half);
  }
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', def.d);
  svg.appendChild(path);
  return svg;
}
