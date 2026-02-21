/**
 * Shared dynamic-signal detection heuristics used by locator-repair and
 * assertion-stability to identify headline-like changing content.
 */

export const DYNAMIC_KEYWORDS = new Set([
  "weather",
  "winterweer",
  "winter",
  "storm",
  "sneeuw",
  "rain",
  "regen",
  "temperatuur",
  "temperature",
  "breaking",
  "liveblog",
  "update",
  "live",
  "video",
  "vandaag",
  "today",
  "gisteren",
  "yesterday",
]);

/** Detect dynamic signals from free text (assertion text or locator name). */
export function detectDynamicSignals(value: string): string[] {
  const out: string[] = [];
  const normalized = value.trim().toLowerCase();
  if (!normalized) return out;
  const normalizedWords = normalized.split(/[^a-z0-9]+/u).filter((word) => word.length > 0);

  if (/\b\d{2,}\b/.test(normalized)) out.push("contains_numeric_fragment");
  if (
    /\b\d{1,2}[:.]\d{2}\b/.test(normalized) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(normalized) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(normalized)
  ) {
    out.push("contains_date_or_time_fragment");
  }

  for (const keyword of DYNAMIC_KEYWORDS) {
    if (normalizedWords.includes(keyword)) {
      out.push("contains_weather_or_news_fragment");
      break;
    }
  }

  // Headline-like text: >= 30 chars, 5+ words, mixed case
  const original = value.trim();
  if (original.length >= 30) {
    const words = original.split(/\s+/).filter((w) => w.length > 0);
    const hasUpperCase = /[A-Z]/.test(original);
    const hasLowerCase = /[a-z]/.test(original);
    if (words.length >= 5 && hasUpperCase && hasLowerCase) {
      out.push("contains_headline_like_text");
    }
  }

  // Pipe separator (common in news headline concatenations)
  if (normalized.includes("|")) {
    out.push("contains_pipe_separator");
  }

  return out;
}
