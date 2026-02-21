import { describe, expect, it } from "vitest";
import { detectDynamicSignals } from "./dynamic-signal-detection.js";

describe("detectDynamicSignals", () => {
  it("returns empty array for stable short text", () => {
    expect(detectDynamicSignals("Submit form")).toEqual([]);
  });

  it("detects numeric fragments", () => {
    const flags = detectDynamicSignals("Score: 42 points");
    expect(flags).toContain("contains_numeric_fragment");
  });

  it("detects date fragments", () => {
    const flags = detectDynamicSignals("Published 2026-02-19");
    expect(flags).toContain("contains_date_or_time_fragment");
  });

  it("detects time fragments", () => {
    const flags = detectDynamicSignals("Updated at 12:30");
    expect(flags).toContain("contains_date_or_time_fragment");
  });

  it("detects weather/news dynamic keywords", () => {
    expect(detectDynamicSignals("breaking news alert")).toContain("contains_weather_or_news_fragment");
    expect(detectDynamicSignals("liveblog updates")).toContain("contains_weather_or_news_fragment");
    expect(detectDynamicSignals("winterweer verwacht")).toContain("contains_weather_or_news_fragment");
    expect(detectDynamicSignals("live stream")).toContain("contains_weather_or_news_fragment");
    expect(detectDynamicSignals("video van vandaag")).toContain("contains_weather_or_news_fragment");
  });

  it("does not match dynamic keywords by substring only", () => {
    const flags = detectDynamicSignals("Deliver package status");
    expect(flags).not.toContain("contains_weather_or_news_fragment");
  });

  it("detects headline-like text (>= 30 chars, 5+ words, mixed case)", () => {
    const flags = detectDynamicSignals("Video Dolblije Erben Wennemars viert feest met schaatsploeg");
    expect(flags).toContain("contains_headline_like_text");
  });

  it("does not flag all-lowercase long text as headline-like", () => {
    const flags = detectDynamicSignals("this is a very long sentence with many words but all lowercase");
    expect(flags).not.toContain("contains_headline_like_text");
  });

  it("does not flag short mixed-case text as headline-like", () => {
    const flags = detectDynamicSignals("Short Title Here");
    expect(flags).not.toContain("contains_headline_like_text");
  });

  it("detects pipe separator", () => {
    const flags = detectDynamicSignals("Live Epstein | Trump vindt documenten");
    expect(flags).toContain("contains_pipe_separator");
  });

  it("returns empty for empty/whitespace input", () => {
    expect(detectDynamicSignals("")).toEqual([]);
    expect(detectDynamicSignals("   ")).toEqual([]);
  });
});
