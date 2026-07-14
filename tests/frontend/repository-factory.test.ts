import { describe, expect, it } from "vitest";
import { HttpKnowledgeRepository } from "../../packages/ontology-client/src/index";
import { createKnowledgeRepository } from "../../src/repositories";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

describe("Knowledge repository factory", () => {
  it("creates local mode by default", () => {
    expect(createKnowledgeRepository({ mode: "local" })).toBeInstanceOf(MockKnowledgeRepository);
  });

  it("creates HTTP mode from centralized configuration", () => {
    expect(createKnowledgeRepository({ mode: "http", apiBaseUrl: "http://127.0.0.1:4174/api", timeoutMs: 2500 })).toBeInstanceOf(HttpKnowledgeRepository);
  });

  it("rejects unsupported modes and invalid timeouts", () => {
    expect(() => createKnowledgeRepository({ mode: "remote" as never })).toThrow("Use local or http");
    expect(() => createKnowledgeRepository({ mode: "http", timeoutMs: 0 })).toThrow("Invalid knowledge repository timeout");
  });
});
