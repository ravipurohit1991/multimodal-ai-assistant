import type { Message } from "./types";

export type StorySearchScope = "all" | "user" | "assistant" | "narrator";

export interface StorySearchOptions {
  query: string;
  scope: StorySearchScope;
  bookmarksOnly: boolean;
  userName: string;
  assistantName: string;
}

export interface StorySearchResult {
  index: number;
  message: Message;
  speaker: string;
}

/** The same speaker label the transcript renders for a message. */
export function storyMessageSpeaker(
  message: Message,
  userName: string,
  assistantName: string,
): string {
  if (message.narrator) return "Narration";
  if (message.role === "user") return userName || "You";
  return message.speaker || assistantName || "Assistant";
}

function isInScope(message: Message, scope: StorySearchScope): boolean {
  if (scope === "all") return true;
  if (scope === "narrator") return message.narrator === true;
  if (scope === "user") return message.role === "user" && !message.narrator;
  return message.role === "assistant" && !message.narrator;
}

/**
 * Search the visible story, including the rendered speaker name. Results stay
 * in transcript order so keyboard navigation follows the story naturally.
 */
export function filterStoryMessages(
  messages: Message[],
  options: StorySearchOptions,
): StorySearchResult[] {
  const needle = options.query.trim().toLowerCase();

  return messages.flatMap((message, index) => {
    if (!isInScope(message, options.scope)) return [];
    if (options.bookmarksOnly && !message.bookmarked) return [];

    const speaker = storyMessageSpeaker(
      message,
      options.userName,
      options.assistantName,
    );
    const haystack = `${speaker}\n${message.content}`.toLowerCase();
    if (needle && !haystack.includes(needle)) return [];

    return [{ index, message, speaker }];
  });
}
