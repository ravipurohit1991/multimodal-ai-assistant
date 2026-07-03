/**
 * Design tokens — "ink & limelight".
 *
 * The app is a stage for living stories: the conversation area is the lit
 * stage (scene-reactive light, weather, mood), and every control around it is
 * the darkened director's console. Chrome therefore stays quiet — deep ink
 * surfaces, hairline borders, one warm amber "limelight" accent for primary
 * actions and presence, and a dusk-violet secondary for the story's voice.
 *
 * Fonts are bundled (see main.tsx): IBM Plex Sans for the console, Literata
 * for story prose, IBM Plex Mono for data. `applyThemeToDocument` mirrors the
 * active theme into CSS variables so the global stylesheet (styles.css)
 * follows theme switches.
 */

export interface Theme {
  name: 'light' | 'dark';
  colors: {
    // Main backgrounds
    background: string;
    surface: string;
    surfaceElevated: string;

    // Text colors
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;

    // Limelight accent (primary actions, focus, "you")
    primary: string;
    primaryHover: string;
    primaryLight: string;
    /** Ink used on top of the amber accent (buttons, chips). */
    primaryInk: string;

    // Dusk violet (the story's voice: dialogue, assistant presence)
    secondary: string;
    secondaryHover: string;

    // Borders
    border: string;
    borderLight: string;

    // Status colors (quiet)
    success: string;
    successLight: string;
    error: string;
    errorLight: string;
    warning: string;
    warningLight: string;
    info: string;
    infoLight: string;

    // Message bubbles (translucent, so the stage light shows through)
    userBubble: string;
    assistantBubble: string;

    // Interactive elements
    buttonPrimary: string;
    buttonPrimaryHover: string;
    buttonSecondary: string;
    buttonSecondaryHover: string;
    buttonDisabled: string;

    // Form fields
    field: string;

    // Modal scrim
    overlay: string;

    // Shadows
    shadowSm: string;
    shadowMd: string;
    shadowLg: string;
  };
  fonts: {
    /** Console / UI text. */
    ui: string;
    /** Story prose (assistant replies, cinematic mode, narration). */
    prose: string;
    /** Data: timestamps, stats, debug. */
    mono: string;
  };
  radii: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}

export const FONT_UI =
  "'IBM Plex Sans', 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif";
export const FONT_PROSE =
  "Literata, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
export const FONT_MONO =
  "'IBM Plex Mono', 'Cascadia Mono', Consolas, 'SF Mono', monospace";

const fonts = { ui: FONT_UI, prose: FONT_PROSE, mono: FONT_MONO };
const radii = { sm: 6, md: 9, lg: 14, xl: 20 };

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    background: '#12141d',
    surface: '#181b26',
    surfaceElevated: '#202534',

    textPrimary: '#eceef4',
    textSecondary: '#a9aebe',
    textTertiary: '#747b8f',

    primary: '#e0a458',
    primaryHover: '#ecb976',
    primaryLight: 'rgba(224, 164, 88, 0.14)',
    primaryInk: '#221607',

    secondary: '#968ede',
    secondaryHover: '#aaa3e8',

    border: '#2a2f40',
    borderLight: '#222634',

    success: '#7fc98f',
    successLight: 'rgba(127, 201, 143, 0.14)',
    error: '#e5726f',
    errorLight: 'rgba(229, 114, 111, 0.14)',
    warning: '#e3b341',
    warningLight: 'rgba(227, 179, 65, 0.14)',
    info: '#6aa6e8',
    infoLight: 'rgba(106, 166, 232, 0.14)',

    userBubble: 'rgba(224, 164, 88, 0.13)',
    assistantBubble: 'rgba(26, 30, 43, 0.88)',

    buttonPrimary: '#e0a458',
    buttonPrimaryHover: '#ecb976',
    buttonSecondary: 'rgba(255, 255, 255, 0.055)',
    buttonSecondaryHover: 'rgba(255, 255, 255, 0.10)',
    buttonDisabled: 'rgba(255, 255, 255, 0.07)',

    field: 'rgba(255, 255, 255, 0.045)',
    overlay: 'rgba(8, 9, 14, 0.66)',

    shadowSm: '0 1px 3px rgba(0, 0, 0, 0.35)',
    shadowMd: '0 6px 18px rgba(0, 0, 0, 0.35)',
    shadowLg: '0 18px 50px rgba(0, 0, 0, 0.5)',
  },
  fonts,
  radii,
};

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: '#f1f0ec',
    surface: '#faf9f7',
    surfaceElevated: '#ffffff',

    textPrimary: '#26242e',
    textSecondary: '#5c5a66',
    textTertiary: '#8b8994',

    primary: '#a9742f',
    primaryHover: '#8f5f22',
    primaryLight: 'rgba(169, 116, 47, 0.12)',
    primaryInk: '#fdf9f2',

    secondary: '#5f55c4',
    secondaryHover: '#4c43ad',

    border: '#dcd9d1',
    borderLight: '#e8e6e0',

    success: '#3e9e5c',
    successLight: 'rgba(62, 158, 92, 0.12)',
    error: '#cc4b48',
    errorLight: 'rgba(204, 75, 72, 0.10)',
    warning: '#b98718',
    warningLight: 'rgba(185, 135, 24, 0.13)',
    info: '#3d7cc9',
    infoLight: 'rgba(61, 124, 201, 0.11)',

    userBubble: 'rgba(169, 116, 47, 0.10)',
    assistantBubble: 'rgba(255, 255, 255, 0.86)',

    buttonPrimary: '#a9742f',
    buttonPrimaryHover: '#8f5f22',
    buttonSecondary: 'rgba(38, 36, 46, 0.055)',
    buttonSecondaryHover: 'rgba(38, 36, 46, 0.10)',
    buttonDisabled: 'rgba(38, 36, 46, 0.08)',

    field: 'rgba(38, 36, 46, 0.04)',
    overlay: 'rgba(30, 28, 38, 0.42)',

    shadowSm: '0 1px 3px rgba(30, 28, 38, 0.10)',
    shadowMd: '0 6px 18px rgba(30, 28, 38, 0.10)',
    shadowLg: '0 18px 50px rgba(30, 28, 38, 0.18)',
  },
  fonts,
  radii,
};

export function getTheme(themeName: 'light' | 'dark'): Theme {
  return themeName === 'light' ? lightTheme : darkTheme;
}

/**
 * Mirror the active theme into CSS variables on <html>, so the global
 * stylesheet (scrollbars, focus rings, utility classes) tracks theme switches.
 */
export function applyThemeToDocument(theme: Theme) {
  const c = theme.colors;
  const root = document.documentElement;
  const vars: Record<string, string> = {
    '--bg': c.background,
    '--surface': c.surface,
    '--elevated': c.surfaceElevated,
    '--text-1': c.textPrimary,
    '--text-2': c.textSecondary,
    '--text-3': c.textTertiary,
    '--accent': c.primary,
    '--accent-hover': c.primaryHover,
    '--accent-soft': c.primaryLight,
    '--accent-ink': c.primaryInk,
    '--accent-2': c.secondary,
    '--accent-2-hover': c.secondaryHover,
    '--border': c.border,
    '--border-light': c.borderLight,
    '--field': c.field,
    '--danger': c.error,
    '--danger-soft': c.errorLight,
    '--ok': c.success,
    '--warn': c.warning,
    '--info': c.info,
    '--btn-ghost': c.buttonSecondary,
    '--btn-ghost-hover': c.buttonSecondaryHover,
    '--overlay': c.overlay,
    '--shadow-sm': c.shadowSm,
    '--shadow-md': c.shadowMd,
    '--shadow-lg': c.shadowLg,
    '--font-ui': theme.fonts.ui,
    '--font-prose': theme.fonts.prose,
    '--font-mono': theme.fonts.mono,
    '--scrollbar-track': 'transparent',
    '--scrollbar-thumb': theme.name === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(30,28,38,0.18)',
    '--scrollbar-thumb-hover': theme.name === 'dark' ? 'rgba(255,255,255,0.26)' : 'rgba(30,28,38,0.32)',
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = theme.name;
}
