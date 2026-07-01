import React from "react";
import { Theme } from "../theme";

interface FormattedTextProps {
  text: string;
  theme: Theme;
  /** Color for quoted dialogue. Defaults to the secondary accent. */
  dialogueColor?: string;
  /** Color for *narration / actions*. Defaults to a muted tone. */
  actionColor?: string;
}

// Matches **bold**, *italics/actions*, _italics_, and "spoken dialogue".
const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*\n][^*]*\*|_[^_\n]+_|"[^"]+")/g;

/**
 * Renders roleplay prose with light, intentional styling so narration,
 * emphasis, and spoken dialogue read distinctly — the way SillyTavern-style
 * clients present chats. Falls back to plain text for anything unmatched and
 * preserves whitespace via the parent's `white-space: pre-wrap`.
 */
export function FormattedText({ text, theme, dialogueColor, actionColor }: FormattedTextProps) {
  const dialogue = dialogueColor ?? theme.colors.secondary;
  const action = actionColor ?? theme.colors.textTertiary;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const tok = match[0];
    if (tok.startsWith("**")) {
      nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      nodes.push(
        <em key={key++} style={{ color: action, opacity: 0.9 }}>
          {tok.slice(1, -1)}
        </em>
      );
    } else if (tok.startsWith("_")) {
      nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith('"')) {
      nodes.push(
        <span key={key++} style={{ color: dialogue, fontWeight: 600 }}>
          {tok}
        </span>
      );
    }
    lastIndex = TOKEN_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return <>{nodes}</>;
}
