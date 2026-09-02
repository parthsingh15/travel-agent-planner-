// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geminiProvider } from "@/lib/ai/gemini";
import { openaiProvider } from "@/lib/ai/openai";
import { AIError } from "@/lib/ai/types";
import { configuredProviderName, aiStatus, isAIConfigured } from "@/lib/ai";

const ORIGINAL = { ...process.env };

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const okBody = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "AIzaSyTESTKEY_0123456789abcdefghij";
  process.env.GEMINI_MODEL = "gemini-2.0-flash";
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("defaults to gemini", () => {
    delete process.env.AI_PROVIDER;
    expect(configuredProviderName()).toBe("gemini");
  });

  it("honours AI_PROVIDER=openai", () => {
    process.env.AI_PROVIDER = "openai";
    expect(configuredProviderName()).toBe("openai");
  });

  it("falls back to gemini for an unknown provider name", () => {
    process.env.AI_PROVIDER = "llama";
    expect(configuredProviderName()).toBe("gemini");
  });

  it("reports configuration status without leaking the key", () => {
    const s = aiStatus();
    expect(s.provider).toBe("gemini");
    expect(s.configured).toBe(true);
    expect(JSON.stringify(s)).not.toContain("AIzaSyTESTKEY");
  });

  it("treats a placeholder key as unconfigured", () => {
    process.env.GEMINI_API_KEY = "your-gemini-api-key";
    expect(isAIConfigured()).toBe(false);
  });

  it("treats an empty key as unconfigured", () => {
    process.env.GEMINI_API_KEY = "";
    expect(isAIConfigured()).toBe(false);
  });

  it("lists the other provider when it is configured", () => {
    process.env.OPENAI_API_KEY = "sk-realkey0123456789abcdefghij";
    expect(aiStatus().alternativesConfigured).toContain("openai");
  });
});

describe("gemini requests", () => {
  it("sends the key as a header, never in the URL", async () => {
    let seenUrl = ""; let seenHeaders: Record<string, string> = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seenUrl = url; seenHeaders = init.headers as Record<string, string>;
      return reply(200, okBody("hello"));
    }));

    await geminiProvider.generate({ messages: [{ role: "user", content: "hi" }] });

    expect(seenUrl).not.toContain("AIzaSy");
    expect(seenHeaders["x-goog-api-key"]).toBe("AIzaSyTESTKEY_0123456789abcdefghij");
  });

  it("maps assistant role to gemini's model role", async () => {
    let body: any;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return reply(200, okBody("ok"));
    }));

    await geminiProvider.generate({
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ],
    });

    expect(body.contents.map((c: any) => c.role)).toEqual(["user", "model"]);
  });

  it("passes the system prompt as systemInstruction", async () => {
    let body: any;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return reply(200, okBody("ok"));
    }));

    await geminiProvider.generate({ system: "be brief", messages: [{ role: "user", content: "hi" }] });
    expect(body.systemInstruction.parts[0].text).toBe("be brief");
  });

  it("requests JSON mime type in json mode", async () => {
    let body: any;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return reply(200, okBody('{"a":1}'));
    }));

    await geminiProvider.generate({ messages: [{ role: "user", content: "hi" }], json: true });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("returns text and usage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, okBody("the answer"))));
    const r = await geminiProvider.generate({ messages: [{ role: "user", content: "q" }] });
    expect(r.text).toBe("the answer");
    expect(r.provider).toBe("gemini");
    expect(r.usage?.outputTokens).toBe(5);
  });
});

describe("gemini error handling", () => {
  it("missing key", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(
      geminiProvider.generate({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ kind: "missing_key" });
  });

  it("invalid key (400 API key not valid)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      reply(400, { error: { message: "API key not valid. Please pass a valid API key." } })
    ));
    await expect(
      geminiProvider.generate({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ kind: "invalid_key" });
  });

  it("invalid key (403)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(403, { error: { message: "denied" } })));
    await expect(
      geminiProvider.generate({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ kind: "invalid_key" });
  });

  it("rate limit (429) is retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(429, { error: { message: "Too many requests" } })));
    try {
      await geminiProvider.generate({ messages: [{ role: "user", content: "x" }] });
      expect.unreachable();
    } catch (e) {
      expect((e as AIError).kind).toBe("rate_limit");
      expect((e as AIError).retryable).toBe(true);
    }
  });

  it("quota exhaustion is distinguished from a rate limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      reply(429, { error: { message: "You exceeded your current quota" } })
    ));
    try {
      await geminiProvider.generate({ messages: [{ role: "user", content: "x" }] });
      expect.unreachable();
    } catch (e) {
      expect((e as AIError).kind).toBe("quota_exceeded");
      expect((e as AIError).retryable).toBe(false);
    }
  });

  it("unknown model (404) points at GEMINI_MODEL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(404, { error: { message: "not found" } })));
    try {
      await geminiProvider.generate({ messages: [{ role: "user", content: "x" }] });
      expect.unreachable();
    } catch (e) {
      expect((e as AIError).message).toMatch(/GEMINI_MODEL/);
    }
  });

  it("server error is retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(503, { error: { message: "overloaded" } })));
    try {
      await geminiProvider.generate({ messages: [{ role: "user", content: "x" }] });
      expect.unreachable();
    } catch (e) {
      expect((e as AIError).kind).toBe("unavailable");
      expect((e as AIError).retryable).toBe(true);
    }
  });

  it("network failure maps to unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(
      geminiProvider.generate({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("empty candidate list maps to empty_response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { candidates: [] })));
    await expect(
      geminiProvider.generate({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ kind: "empty_response" });
  });

  it("blocked prompt is reported as blocked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { promptFeedback: { blockReason: "SAFETY" } })));
    await expect(
      geminiProvider.generate({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ kind: "blocked" });
  });

  it("user-facing messages never contain key material", () => {
    for (const kind of ["missing_key", "invalid_key", "rate_limit", "quota_exceeded", "unavailable", "empty_response", "blocked"] as const) {
      const msg = new AIError(kind, "internal detail AIzaSyTESTKEY").userMessage;
      expect(msg).not.toContain("AIzaSy");
      expect(msg.length).toBeGreaterThan(10);
    }
  });
});

describe("openai provider stays available", () => {
  it("is unconfigured while the key is a placeholder", () => {
    process.env.OPENAI_API_KEY = "sk-your-openai-api-key";
    expect(openaiProvider.isConfigured()).toBe(false);
  });

  it("is configured with a real-looking key", () => {
    process.env.OPENAI_API_KEY = "sk-abcdefghijklmnopqrstuvwxyz0123456789";
    expect(openaiProvider.isConfigured()).toBe(true);
  });

  it("throws missing_key rather than calling out with no key", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(
      openaiProvider.generate({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ kind: "missing_key" });
  });
});
