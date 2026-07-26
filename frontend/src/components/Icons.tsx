import React from "react";

/**
 * Inline SVG icon set — one consistent stroke family (1.8px, round caps) so
 * every control in the console reads as part of the same instrument panel.
 * Icons inherit `currentColor`; size defaults to 16.
 */

export interface IconProps {
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

function make(children: React.ReactNode) {
  return function Icon({ size = 16, style, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, ...style }}
        className={className}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

export const IconSend = make(<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></>);
export const IconImage = make(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>);
export const IconWand = make(<><path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="m17.8 11.8 1.2 1.2" /><path d="M15 9h.01" /><path d="m17.8 6.2 1.2-1.2" /><path d="m3 21 9-9" /><path d="m12.2 6.2-1.2-1.2" /></>);
export const IconBulb = make(<><path d="M15.1 14c.2-1 .7-1.7 1.4-2.5a4.65 4.65 0 0 0 1.5-3.5 6 6 0 0 0-12 0c0 1 .2 2.2 1.5 3.5.7.8 1.2 1.5 1.4 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></>);
export const IconClapper = make(<><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>);
export const IconFeather = make(<><path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5Z" /><path d="M16 8 2 22" /><path d="M17.5 15H9" /></>);
export const IconPlay = make(<path d="m8 5 11 7-11 7V5Z" />);
export const IconSkipForward = make(<><path d="m5 4 10 8-10 8V4Z" /><path d="M19 5v14" /></>);
export const IconMic = make(<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></>);
export const IconPhone = make(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />);
export const IconPhoneOff = make(<><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" /><path d="M22 2 2 22" /></>);
export const IconStop = make(<rect x="6" y="6" width="12" height="12" rx="1.5" />);
export const IconTrash = make(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></>);
export const IconPencil = make(<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />);
export const IconRewind = make(<><path d="m11 19-9-7 9-7v14Z" /><path d="m22 19-9-7 9-7v14Z" /></>);
export const IconRefresh = make(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>);
export const IconPlus = make(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const IconChevronRight = make(<path d="m9 18 6-6-6-6" />);
export const IconChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const IconChevronLeft = make(<path d="m15 18-6-6 6-6" />);
export const IconX = make(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const IconDownload = make(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>);
export const IconUpload = make(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 8 5-5 5 5" /><path d="M12 3v12" /></>);
export const IconBookOpen = make(<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>);
export const IconSliders = make(<><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" /></>);
export const IconUsers = make(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);
export const IconUser = make(<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>);
export const IconSparkles = make(<><path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" /></>);
export const IconVolume = make(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>);
export const IconVolumeOff = make(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></>);
export const IconPanelLeft = make(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>);
export const IconPanelRight = make(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></>);
export const IconSun = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>);
export const IconMoon = make(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);
export const IconArchive = make(<><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>);
export const IconHistory = make(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>);
export const IconActivity = make(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />);
export const IconCode = make(<><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>);
export const IconPower = make(<><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></>);
export const IconCheck = make(<path d="M20 6 9 17l-5-5" />);
export const IconAlert = make(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>);
export const IconFilm = make(<><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M7 3v18" /><path d="M17 3v18" /><path d="M2 9h5" /><path d="M2 15h5" /><path d="M17 9h5" /><path d="M17 15h5" /></>);
export const IconEraser = make(<><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></>);
export const IconCopy = make(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>);
export const IconShuffle = make(<><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22" /><path d="m18 2 4 4-4 4" /><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" /><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" /><path d="m18 14 4 4-4 4" /></>);
export const IconMapPin = make(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>);
export const IconMessage = make(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />);
export const IconSave = make(<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></>);
export const IconFolder = make(<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />);
export const IconMoreH = make(<><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>);
export const IconItalic = make(<><path d="M19 4h-9" /><path d="M14 20H5" /><path d="M15 4 9 20" /></>);
export const IconBrain = make(<><path d="M9.5 3a2.5 2.5 0 0 0-2.4 1.8A2.5 2.5 0 0 0 5 7.2a2.5 2.5 0 0 0-.6 4.3A2.5 2.5 0 0 0 5 16a2.5 2.5 0 0 0 2.2 2.7A2.5 2.5 0 0 0 12 18V5.5A2.5 2.5 0 0 0 9.5 3Z" /><path d="M14.5 3A2.5 2.5 0 0 1 17 5.5V18a2.5 2.5 0 0 1-4.8.7" /><path d="M17 4.8a2.5 2.5 0 0 1 2.1 2.4 2.5 2.5 0 0 1 .6 4.3A2.5 2.5 0 0 1 19 16a2.5 2.5 0 0 1-2.2 2.7" /></>);
export const IconShield = make(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>);
export const IconThreads = make(<><circle cx="6" cy="5" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="8" cy="19" r="2.5" /><path d="M8.4 5.6 15.6 7.4" /><path d="m7 7.3.7 9.2" /><path d="m10.1 17.8 5.9-7.6" /></>);
export const IconPin = make(<><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /></>);
export const IconSearch = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>);
export const IconBookmark = make(<path d="M6 3h12a1 1 0 0 1 1 1v18l-7-4-7 4V4a1 1 0 0 1 1-1Z" />);
export const IconDice = make(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" /></>);
export const IconEye = make(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = make(<><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3.1 3.8" /><path d="M6.6 6.9A17.4 17.4 0 0 0 2 12s3.6 6 10 6a9.9 9.9 0 0 0 4.1-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" /></>);
