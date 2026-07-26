import { describe, expect, it } from "vitest";

import {
  aiRateLimitFeedback,
  describeAiGenerateFailure,
  formatRetryAfter,
} from "./generate-feedback";

describe("formatRetryAfter", () => {
  it("formats seconds, minutes, and hours", () => {
    expect(formatRetryAfter(1_000)).toBe("1 second");
    expect(formatRetryAfter(45_000)).toBe("45 seconds");
    expect(formatRetryAfter(60_000)).toBe("1 minute");
    expect(formatRetryAfter(150_000)).toBe("3 minutes");
    expect(formatRetryAfter(3_600_000)).toBe("1 hour");
    expect(formatRetryAfter(7_200_000)).toBe("2 hours");
  });
});

describe("aiRateLimitFeedback", () => {
  it("explains the per-minute limit", () => {
    expect(
      aiRateLimitFeedback({
        scope: "minute",
        limit: 5,
        retryAfterMs: 30_000,
      }),
    ).toMatchObject({
      code: "AI_RATE_LIMITED",
      scope: "minute",
      error: "Too many AI generations right now",
      hint: "Limit is 5 per minute. Try again in 30 seconds.",
    });
  });

  it("explains the daily limit", () => {
    expect(
      aiRateLimitFeedback({
        scope: "day",
        limit: 50,
        retryAfterMs: 3_600_000,
      }),
    ).toMatchObject({
      code: "AI_RATE_LIMITED",
      scope: "day",
      error: "Daily AI limit reached",
      hint: "Limit is 50 generations per day. Try again in 1 hour.",
    });
  });
});

describe("describeAiGenerateFailure", () => {
  it("maps rate-limit payloads for the UI", () => {
    expect(
      describeAiGenerateFailure(
        {
          code: "AI_RATE_LIMITED",
          error: "Too many AI generations right now",
          hint: "Limit is 5 per minute. Try again in 30 seconds.",
        },
        "fallback",
      ),
    ).toEqual({
      title: "Too many AI generations right now",
      description: "Limit is 5 per minute. Try again in 30 seconds.",
    });
  });

  it("maps Pro-required payloads", () => {
    expect(
      describeAiGenerateFailure({ code: "PRO_REQUIRED" }, "fallback"),
    ).toEqual({
      title: "AI generation requires Pro",
      description: "Upgrade in Settings to unlock Describe with AI.",
    });
  });
});
