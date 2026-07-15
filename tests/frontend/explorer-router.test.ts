import { describe, expect, it } from "vitest";
import { buildExplorerUrl, pageRoute, parseExplorerLocation } from "../../src/router/explorerRouter";

describe("Explorer URL router", () => {
  it("keeps the legacy root entry compatible with Production Route Explorer", () => {
    expect(parseExplorerLocation({ pathname: "/", search: "" })).toEqual({
      page: "route",
      viewMode: "production",
      selectedEntityId: undefined,
      focusEntityId: undefined,
      query: undefined,
    });
  });

  it("round-trips restorable Route state without transient canvas state", () => {
    const url = buildExplorerUrl({
      page: "route",
      viewMode: "quality",
      selectedEntityId: "OP30",
      focusEntityId: "OP30",
      query: "Leak Rate",
    });
    const parsedUrl = new URL(url, "http://demo.local");

    expect(parseExplorerLocation(parsedUrl)).toMatchObject({
      page: "route",
      viewMode: "quality",
      selectedEntityId: "OP30",
      focusEntityId: "OP30",
      query: "Leak Rate",
    });
    expect(url).not.toMatch(/hover|drag|viewport|opacity/i);
  });

  it("creates stable canonical page entries", () => {
    expect(buildExplorerUrl(pageRoute("route"))).toBe("/routes/production");
    expect(buildExplorerUrl(pageRoute("ontology"))).toBe("/ontology");
    expect(buildExplorerUrl(pageRoute("semantic"))).toBe("/semantic");
    expect(buildExplorerUrl(pageRoute("agent"))).toBe("/agent");
  });

  it("opens Agent Demo through a stable standalone route", () => {
    expect(parseExplorerLocation({ pathname: "/agent", search: "" })).toMatchObject({ page: "agent" });
    expect(parseExplorerLocation({ pathname: "/agent/unknown", search: "" })).toMatchObject({
      page: "agent",
      invalidPath: "/agent/unknown",
    });
  });

  it("falls back safely for unknown paths", () => {
    expect(parseExplorerLocation({ pathname: "/unknown", search: "" })).toMatchObject({
      page: "route",
      viewMode: "production",
      invalidPath: "/unknown",
    });
  });
});
