import { describe, it, expect } from "vitest";
import {
  AgentJsonError,
  parseAgentJson,
  tryParseAgentJson,
} from "@/lib/agents/json";

describe("tolerant agent JSON parsing", () => {
  it("parses clean JSON", () => {
    expect(tryParseAgentJson('{"score":91}')).toEqual({ score: 91 });
  });

  it("recovers JSON wrapped in markdown fences", () => {
    const raw = '```json\n{"bestOption":"flt-1","price":450}\n```';
    expect(tryParseAgentJson(raw)).toEqual({ bestOption: "flt-1", price: 450 });
  });

  it("recovers JSON wrapped in unlabelled fences", () => {
    expect(tryParseAgentJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers JSON surrounded by prose", () => {
    const raw = 'Sure! Here is the plan:\n{"days":3}\nHope that helps.';
    expect(tryParseAgentJson(raw)).toEqual({ days: 3 });
  });

  it("recovers a top-level array", () => {
    expect(tryParseAgentJson('Here you go: [{"id":"act-1"}]')).toEqual([
      { id: "act-1" },
    ]);
  });

  it("preserves nested braces when trimming prose", () => {
    const raw = 'Result: {"a":{"b":{"c":1}}} done';
    expect(tryParseAgentJson(raw)).toEqual({ a: { b: { c: 1 } } });
  });

  it("returns null for unrecoverable output", () => {
    expect(tryParseAgentJson("I cannot help with that.")).toBeNull();
    expect(tryParseAgentJson("")).toBeNull();
    expect(tryParseAgentJson("{ not json at all ")).toBeNull();
  });

  it("throws a descriptive error naming the failing agent", () => {
    expect(() => parseAgentJson("flights", "totally broken")).toThrow(
      AgentJsonError
    );
    expect(() => parseAgentJson("flights", "totally broken")).toThrow(
      /Agent "flights"/
    );
  });

  it("rejects valid JSON that is not an object", () => {
    expect(() => parseAgentJson("budget", "42")).toThrow(AgentJsonError);
  });

  it("exposes the raw payload on the error for debugging", () => {
    try {
      parseAgentJson("stays", "nope");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentJsonError);
      expect((error as AgentJsonError).agent).toBe("stays");
      expect((error as AgentJsonError).raw).toBe("nope");
    }
  });
});
