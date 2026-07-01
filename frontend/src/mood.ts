// Shared helpers for turning a free-form mood word into UI cues.

const MOOD_TABLE: [string[], string, string][] = [
  // keywords, emoji, accent color
  [["happy", "joy", "cheerful", "delighted", "glad", "content"], "😊", "#f6c945"],
  [["playful", "teasing", "mischievous", "fun"], "😜", "#f59e0b"],
  [["flirty", "flirtatious", "playful-romantic", "charming"], "😏", "#ec4899"],
  [["love", "affection", "loving", "warm", "adoring"], "🥰", "#f43f5e"],
  [["sad", "down", "sorrow", "hurt", "melancholy", "gloomy"], "😢", "#60a5fa"],
  [["angry", "mad", "furious", "irritated", "annoyed"], "😠", "#ef4444"],
  [["nervous", "anxious", "worried", "uneasy", "scared", "afraid", "fearful"], "😰", "#a78bfa"],
  [["surprised", "shocked", "amazed", "astonished"], "😲", "#22d3ee"],
  [["embarrassed", "shy", "bashful", "flustered"], "😳", "#fb7185"],
  [["confident", "proud", "smug"], "😎", "#14b8a6"],
  [["curious", "intrigued", "thoughtful", "pensive"], "🤔", "#818cf8"],
  [["tired", "sleepy", "exhausted", "bored"], "😴", "#94a3b8"],
  [["calm", "relaxed", "peaceful", "serene", "neutral"], "🙂", "#34d399"],
  [["excited", "eager", "enthusiastic", "thrilled"], "🤩", "#fb923c"],
];

/** Map a free-form mood word to a representative emoji. */
export function moodToEmoji(mood: string): string {
  const m = mood.toLowerCase();
  for (const [words, emoji] of MOOD_TABLE) {
    if (words.some((w) => m.includes(w))) return emoji;
  }
  return "💭";
}

/** Map a free-form mood word to an accent color for tinting UI. */
export function moodToColor(mood: string): string {
  const m = mood.toLowerCase();
  for (const [words, , color] of MOOD_TABLE) {
    if (words.some((w) => m.includes(w))) return color;
  }
  return "#9ca3af";
}
