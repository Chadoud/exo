// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BillingSubscribeActions, { computeAnnualMonthsFree } from "./BillingSubscribeActions";
import { I18nProvider } from "../i18n/I18nContext";

describe("computeAnnualMonthsFree", () => {
  it("derives months free from real prices (CHF 20 × 12 = 240 vs CHF 200 → 2 months)", () => {
    expect(computeAnnualMonthsFree("CHF 20", "CHF 200")).toBe(2);
  });

  it("returns 0 when annual is not cheaper — never invents a saving", () => {
    expect(computeAnnualMonthsFree("CHF 20", "CHF 240")).toBe(0);
    expect(computeAnnualMonthsFree("CHF 20", "CHF 300")).toBe(0);
  });

  it("returns 0 for missing or unparseable prices", () => {
    expect(computeAnnualMonthsFree(null, "CHF 200")).toBe(0);
    expect(computeAnnualMonthsFree("CHF 20", null)).toBe(0);
    expect(computeAnnualMonthsFree("gratuit", "n/a")).toBe(0);
  });

  it("handles thousands separators (CHF 1'200)", () => {
    expect(computeAnnualMonthsFree("CHF 120", "CHF 1'200")).toBe(2);
  });
});

describe("BillingSubscribeActions (billing live)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.electronAPI = {
      billingCheckout: vi.fn(() => Promise.resolve({ ok: true })),
      billingGetConfig: vi.fn(() =>
        Promise.resolve({ ok: true, enabled: true, priceMonthly: "CHF 20", priceAnnual: "CHF 200" }),
      ),
    } as unknown as Window["electronAPI"];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.electronAPI = undefined as unknown as Window["electronAPI"];
  });

  const render = async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <BillingSubscribeActions />
        </I18nProvider>,
      );
    });
  };

  it("shows both plan cards with the honest months-free badge and benefits", async () => {
    await render();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Annual");
    expect(text).toContain("CHF 200/year");
    expect(text).toContain("Monthly");
    expect(text).toContain("CHF 20/month");
    expect(text).toContain("2 months free");
    expect(text).toContain("Your files keep sorting themselves");
    expect(text).toContain("Cancel anytime");
  });

  it("starts checkout with the interval of the clicked plan", async () => {
    await render();
    const annualCard = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Annual"),
    ) as HTMLButtonElement;
    await act(async () => {
      annualCard.click();
    });
    expect(window.electronAPI?.billingCheckout).toHaveBeenCalledWith("annual");
  });

  it("falls back to a single subscribe button when billing IPC is absent", async () => {
    window.electronAPI = undefined as unknown as Window["electronAPI"];
    await render();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Subscribe");
    expect(text).not.toContain("2 months free");
  });
});
