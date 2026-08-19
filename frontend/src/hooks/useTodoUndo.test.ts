// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./useTodoUndo";

describe("isTypingTarget", () => {
  it("treats form fields as typing", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(area)).toBe(true);
  });

  it("ignores ordinary buttons", () => {
    const button = document.createElement("button");
    expect(isTypingTarget(button)).toBe(false);
  });

  it("treats contenteditable and role=textbox as typing", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const box = document.createElement("div");
    box.setAttribute("role", "textbox");
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(box)).toBe(true);
  });
});
