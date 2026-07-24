import { beforeEach, describe, expect, it } from "vitest";

import {
  apiKeyDisplayPrefix,
  generateRawApiKey,
  hashApiKey,
  isApiKeyFormat,
} from "../../../backend/lib/apiKeys";

describe("api-keys", () => {
  beforeEach(() => {
    process.env.MCP_API_KEY_PEPPER = "test-pepper-for-unit-tests";
  });

  it("generates keys with the waw_ prefix", () => {
    const key = generateRawApiKey();
    expect(isApiKeyFormat(key)).toBe(true);
    expect(key.startsWith("waw_")).toBe(true);
  });

  it("hashes deterministically with pepper", async () => {
    const raw = "waw_testkey123456789012345678901234";
    const a = await hashApiKey(raw);
    const b = await hashApiKey(raw);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects invalid key format", () => {
    expect(isApiKeyFormat("")).toBe(false);
    expect(isApiKeyFormat("waw_short")).toBe(false);
    expect(isApiKeyFormat(`${generateRawApiKey()}extra`)).toBe(false);
    expect(isApiKeyFormat(`waw_${"!".repeat(43)}`)).toBe(false);
    expect(isApiKeyFormat("sk_live_abc")).toBe(false);
  });

  it("builds a stable display prefix", () => {
    const raw = generateRawApiKey();
    expect(apiKeyDisplayPrefix(raw)).toBe(raw.slice(0, 12));
  });
});
