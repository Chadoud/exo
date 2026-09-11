// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSafeHttpsHref, openHttpsUrl, splitTextLinks } from "./textLinks";

describe("splitTextLinks", () => {
  it("turns an https enroll URL into a link part", () => {
    const text =
      "Enroll now >\nhttps://developer.apple.com/enroll/";
    const parts = splitTextLinks(text);
    expect(parts).toEqual([
      { kind: "text", text: "Enroll now >\n", start: 0 },
      {
        kind: "link",
        text: "https://developer.apple.com/enroll/",
        href: "https://developer.apple.com/enroll/",
        start: "Enroll now >\n".length,
      },
    ]);
  });

  it("keeps a trailing period out of the href", () => {
    const parts = splitTextLinks("See https://example.com/a.");
    expect(parts).toContainEqual({
      kind: "link",
      text: "https://example.com/a",
      href: "https://example.com/a",
      start: 4,
    });
  });

  it("leaves javascript and http runs as text", () => {
    const text = "javascript:alert(1) http://evil.example/x";
    expect(splitTextLinks(text)).toEqual([{ kind: "text", text, start: 0 }]);
  });
});

describe("isSafeHttpsHref", () => {
  it("rejects credentials in the URL", () => {
    expect(isSafeHttpsHref("https://user:pass@example.com/")).toBe(false);
  });
});

describe("openHttpsUrl", () => {
  afterEach(() => {
    window.electronAPI = undefined as unknown as Window["electronAPI"];
  });

  it("uses the Electron bridge for https", () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    window.electronAPI = { openExternal } as unknown as Window["electronAPI"];
    openHttpsUrl("https://developer.apple.com/enroll/");
    expect(openExternal).toHaveBeenCalledWith("https://developer.apple.com/enroll/");
  });

  it("does not open a rejected href", () => {
    const openExternal = vi.fn();
    window.electronAPI = { openExternal } as unknown as Window["electronAPI"];
    openHttpsUrl("https://user:pass@example.com/");
    expect(openExternal).not.toHaveBeenCalled();
  });
});
