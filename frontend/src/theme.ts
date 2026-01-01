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

    // Brand colors (professional, not flashy)
    primary: string;
    primaryHover: string;
    primaryLight: string;

    // Accent colors
    secondary: string;
    secondaryHover: string;

    // Borders
    border: string;
    borderLight: string;

    // Status colors (subtle)
    success: string;
    successLight: string;
    error: string;
    errorLight: string;
    warning: string;
    warningLight: string;
    info: string;
    infoLight: string;

    // Message bubbles
    userBubble: string;
    assistantBubble: string;

    // Interactive elements
    buttonPrimary: string;
    buttonPrimaryHover: string;
    buttonSecondary: string;
    buttonSecondaryHover: string;
    buttonDisabled: string;

    // Shadows
    shadowSm: string;
    shadowMd: string;
    shadowLg: string;
  };
}

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: '#f8f9fb',
    surface: '#ffffff',
    surfaceElevated: '#ffffff',

    textPrimary: '#1a202c',
    textSecondary: '#4a5568',
    textTertiary: '#718096',

    // Professional blue-grey palette
    primary: '#4a5568',
    primaryHover: '#2d3748',
    primaryLight: '#edf2f7',

    secondary: '#5a67d8',
    secondaryHover: '#4c51bf',

    border: '#e2e8f0',
    borderLight: '#f1f5f9',

    success: '#48bb78',
    successLight: '#f0fff4',
    error: '#e53e3e',
    errorLight: '#fff5f5',
    warning: '#ed8936',
    warningLight: '#fffaf0',
    info: '#4299e1',
    infoLight: '#ebf8ff',

    userBubble: '#5a67d8',
    assistantBubble: '#edf2f7',

    buttonPrimary: '#5a67d8',
    buttonPrimaryHover: '#4c51bf',
    buttonSecondary: '#edf2f7',
    buttonSecondaryHover: '#e2e8f0',
    buttonDisabled: '#cbd5e0',

    shadowSm: '0 1px 3px rgba(0, 0, 0, 0.08)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.07)',
    shadowLg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  }
};

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    background: '#0f1419',
    surface: '#1a202c',
    surfaceElevated: '#2d3748',

    textPrimary: '#f7fafc',
    textSecondary: '#cbd5e0',
    textTertiary: '#a0aec0',

    // Professional blue-grey palette for dark mode
    primary: '#90a4ae',
    primaryHover: '#b0bec5',
    primaryLight: '#263238',

    secondary: '#7c83db',
    secondaryHover: '#9599e2',

    border: '#2d3748',
    borderLight: '#1a202c',

    success: '#68d391',
    successLight: '#1c4532',
    error: '#fc8181',
    errorLight: '#4a1d1d',
    warning: '#f6ad55',
    warningLight: '#4a2e1a',
    info: '#63b3ed',
    infoLight: '#1a365d',

    userBubble: '#7c83db',
    assistantBubble: '#2d3748',

    buttonPrimary: '#7c83db',
    buttonPrimaryHover: '#9599e2',
    buttonSecondary: '#2d3748',
    buttonSecondaryHover: '#4a5568',
    buttonDisabled: '#4a5568',

    shadowSm: '0 1px 3px rgba(0, 0, 0, 0.3)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.4)',
    shadowLg: '0 10px 15px rgba(0, 0, 0, 0.5)',
  }
};

export function getTheme(themeName: 'light' | 'dark'): Theme {
  return themeName === 'light' ? lightTheme : darkTheme;
}
