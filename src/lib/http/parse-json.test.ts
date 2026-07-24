import { describe, expect, it } from "vitest";

import { parseBoundedJson, RequestBodyTooLargeError } from "./parse-json";

describe("parseBoundedJson", () => {
  it("parses bounded application/json bodies", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ prompt: "lift" }),
    });

    await expect(parseBoundedJson(request, 1_024)).resolves.toEqual({
      prompt: "lift",
    });
  });

  it("rejects oversized bodies even without a content-length header", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ value: "x".repeat(100) }),
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(parseBoundedJson(request, 32)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects non-JSON content types", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });

    await expect(parseBoundedJson(request, 1_024)).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });
});
