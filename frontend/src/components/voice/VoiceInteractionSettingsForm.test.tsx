// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import { DEFAULT_APP_SETTINGS } from "../../settings/appSettingsHydration";
import type { VoiceBackendReadiness } from "../../hooks/useVoiceBackendReady";
import type { VoiceReadinessSnapshot } from "../../voice/voiceReadiness";
import { VoiceInteractionSettingsForm } from "./VoiceInteractionSettingsForm";

const MISSING_KEY = "Voice is not configured yet — add a Gemini API key to use the mic.";
const CHECKING = "Checking voice…";
const OFFLINE = "Exo is still starting on this computer — try again in a moment.";

function readiness(snapshot: VoiceReadinessSnapshot): VoiceBackendReadiness {
  return { ...snapshot, refresh: vi.fn() };
}

describe("VoiceInteractionSettingsForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderForm = async (
    props: Partial<Parameters<typeof VoiceInteractionSettingsForm>[0]> = {},
  ) => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <VoiceInteractionSettingsForm
            settings={DEFAULT_APP_SETTINGS}
            onSettingsPatch={vi.fn()}
            variant="compact"
            onOpenAiProviderSettings={vi.fn()}
            {...props}
          />
        </I18nProvider>,
      );
    });
  };

  it("keeps Settings-page forms banner-free when no readiness snapshot is passed", async () => {
    await renderForm({ variant: "full", onOpenAiProviderSettings: undefined });
    expect(container.textContent).not.toContain(MISSING_KEY);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("shows checking copy from the readiness snapshot", async () => {
    await renderForm({ voiceReadiness: readiness({ state: "checking" }) });
    expect(container.textContent).toContain(CHECKING);
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-busy")).toBe("true");
  });

  it("shows the missing-key callout from the readiness snapshot", async () => {
    await renderForm({ voiceReadiness: readiness({ state: "missing_key" }) });
    expect(container.textContent).toContain(MISSING_KEY);
    expect(container.textContent).toContain("Set up Gemini");
  });

  it("hides readiness banners when the snapshot is ready", async () => {
    await renderForm({ voiceReadiness: readiness({ state: "ready", model: "gemini-live" }) });
    expect(container.textContent).not.toContain(MISSING_KEY);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("keeps offline unavailable distinct from a missing key", async () => {
    const refresh = vi.fn();
    await renderForm({
      voiceReadiness: { state: "unavailable", reason: "offline", refresh },
    });
    expect(container.textContent).toContain(OFFLINE);
    expect(container.textContent).not.toContain(MISSING_KEY);
    const retry = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Check again"),
    );
    expect(retry).toBeTruthy();
    await act(async () => {
      retry?.click();
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("uses a fieldset and legend for voice mode", async () => {
    await renderForm();
    const fieldset = container.querySelector("fieldset");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.querySelector("legend")?.textContent).toContain("How you talk to the assistant");
  });

  it("marks mode cards with a focus-within ring", async () => {
    await renderForm();
    const card = container.querySelector("fieldset label");
    expect(card?.className).toMatch(/focus-within:ring-2/);
    expect(card?.className).toMatch(/focus-within:ring-accent\/50/);
  });

  it("renders compact hints at text-xs", async () => {
    await renderForm();
    const hint = container.querySelector("fieldset label span.leading-snug");
    expect(hint?.className).toMatch(/text-xs/);
    expect(hint?.className).not.toMatch(/text-2xs/);
  });
});
