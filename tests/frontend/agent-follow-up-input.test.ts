import { describe, expect, it } from "vitest";
import { shouldSubmitAgentInput } from "../../src/features/agent-demo/components/AgentFollowUpInput";

describe("Agent follow-up input", () => {
  it("submits a regular Enter key press", () => {
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 })).toBe(true);
  });

  it("does not submit Enter while an IME composition is active", () => {
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: false, isComposing: true, keyCode: 13 })).toBe(false);
  });

  it("does not submit the legacy IME keyCode used by Safari and Edge", () => {
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 229 })).toBe(false);
  });

  it("keeps Shift+Enter available for a new line", () => {
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: true, isComposing: false, keyCode: 13 })).toBe(false);
  });
});
