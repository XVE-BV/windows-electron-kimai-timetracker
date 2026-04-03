/**
 * Tray Icon Generator (renderer-side)
 *
 * Generates tray icons from lucide SVG paths using Canvas.
 * Icons are rendered as PNG data URLs and sent to the main process via IPC.
 *
 * macOS: Black icons with alpha (template images — OS handles light/dark).
 * Windows: White icons (visible on default dark taskbar).
 */

import { TrayIconState } from '../types';

// Lucide icon paths (from lucide-react v0.563.0, viewBox 0 0 24 24)
// Clock: circle + hour/minute hands
const CLOCK_SVG = `
  <circle cx="12" cy="12" r="10"/>
  <path d="M12 6v6l4 2"/>
`;

// Diagonal slash overlay for "muted" state
const MUTE_SLASH_SVG = `
  <line x1="3" x2="21" y1="3" y2="21" stroke-width="2.5"/>
`;

// Solid red dot for active tracking (like Teams status indicator)
const TRACKING_DOT_COLOR = '#E53935';

type IconDef =
  | { type: 'stroke'; base: string; overlay?: string }
  | { type: 'custom'; svg: (size: number) => string };

const ICON_DEFS: Record<TrayIconState, IconDef> = {
  'idle':            { type: 'stroke', base: CLOCK_SVG },
  'idle-muted':      { type: 'stroke', base: CLOCK_SVG, overlay: MUTE_SLASH_SVG },
  'tracking':        {
    type: 'custom',
    svg: (size) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
      `<circle cx="12" cy="12" r="8" fill="${TRACKING_DOT_COLOR}"/>` +
      `</svg>`,
  },
  'tracking-muted':  {
    type: 'custom',
    svg: (size) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
      `<circle cx="12" cy="12" r="8" fill="${TRACKING_DOT_COLOR}"/>` +
      `<line x1="4" x2="20" y1="4" y2="20" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>` +
      `</svg>`,
  },
};

function buildSvgString(paths: string, color: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function renderSvgToDataUrl(svgString: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Use inline base64 data URI instead of Blob URL (avoids CSP issues in Electron)
    const encoded = btoa(unescape(encodeURIComponent(svgString)));
    const dataUri = `data:image/svg+xml;base64,${encoded}`;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = (e) => {
      reject(new Error(`Failed to render SVG to canvas: ${e}`));
    };

    img.src = dataUri;
  });
}

export async function generateTrayIcons(
  platform: 'darwin' | 'win32' | 'linux',
): Promise<Record<TrayIconState, string>> {
  // macOS template images: black with alpha. Windows: white.
  const color = platform === 'darwin' ? '#000000' : '#FFFFFF';
  // 32px for crisp rendering at 2x (tray icons are 16 logical px)
  const size = 32;

  const entries = await Promise.all(
    (Object.entries(ICON_DEFS) as [TrayIconState, IconDef][]).map(
      async ([state, def]) => {
        let svg: string;
        if (def.type === 'custom') {
          svg = def.svg(size);
        } else {
          const paths = def.overlay ? def.base + def.overlay : def.base;
          svg = buildSvgString(paths, color, size);
        }
        const dataUrl = await renderSvgToDataUrl(svg, size);
        return [state, dataUrl] as [TrayIconState, string];
      },
    ),
  );

  return Object.fromEntries(entries) as Record<TrayIconState, string>;
}
