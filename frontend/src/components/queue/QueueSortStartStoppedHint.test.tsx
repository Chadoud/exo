import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueueSortStartStoppedHint } from "./QueueSortStartStoppedHint";

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === "queue.sortStartDidNotStart") return `stopped:${params?.action ?? ""}`;
  if (key === "queue.sortStartCanceled") return "canceled";
  if (key === "queue.workspaceRunBatch") return "Run sort";
  return key;
};

describe("QueueSortStartStoppedHint", () => {
  it("renders a static failed line without a progressbar", () => {
    const html = renderToStaticMarkup(<QueueSortStartStoppedHint reason="failed" t={t} />);
    expect(html).toContain("stopped:Run sort");
    expect(html).not.toContain("progressbar");
    expect(html).toContain('role="status"');
  });

  it("renders the canceled line", () => {
    const html = renderToStaticMarkup(<QueueSortStartStoppedHint reason="canceled" t={t} />);
    expect(html).toContain("canceled");
  });
});
