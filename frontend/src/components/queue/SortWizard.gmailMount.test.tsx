import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n/I18nContext";
import { DEFAULT_APP_SETTINGS } from "../../settings/appSettingsHydration";
import { SortWizard } from "./SortWizard";
import type { QueuePanelController } from "./useQueuePanelController";

vi.mock("./QueueDesktopWorkspaceSection", () => ({
  QueueDesktopWorkspaceSection: () => <div data-testid="sort-sources-block">sources</div>,
}));
vi.mock("./QueueWebImportSection", () => ({
  QueueWebImportSection: () => null,
}));
vi.mock("../sort/instructions/SortInstructionsStrip", () => ({
  default: () => <div>structure</div>,
}));

const t = (key: string) => key;

function wizardAt(step: 1 | 2 | 3) {
  const workspaceBatch = {
    desktop: true,
    selectedSourcesSummary: [{ id: "gmail", label: "Gmail" }],
    handleRunWorkspaceBatch: () => {},
    handleCancelWorkspaceBatchStart: () => {},
    workspaceBatchDisabled: false,
    workspaceRunBatchDisabledHint: undefined,
    workspaceBatchStarting: false,
    hasSourceSelected: true,
  } as unknown as QueuePanelController["workspaceBatch"];

  return (
    <I18nProvider locale="en">
      <SortWizard
        settings={DEFAULT_APP_SETTINGS}
        workspaceExternalSources={{} as never}
        t={t}
        currentJob={null}
        sortInputDisabled={false}
        sortInputDisabledReason={undefined}
        workspaceBatch={workspaceBatch}
        sendingWithoutJobYet={false}
        prepProgressMode="off"
        prepStallHint={false}
        prepStallTranslationKey="queue.workspacePrepStallDefault"
        jobMetrics={{} as QueuePanelController["jobMetrics"]}
        sortWizard={{
          wizardStep: step,
          setWizardStep: () => {},
          goNext: () => {},
          goBack: () => {},
          goToStep: () => {},
          canGoToStep: () => true,
          canGoNext: true,
        }}
        onSettingsPatch={() => {}}
        backendOnline
        onFiles={async () => {}}
        onBrowserFiles={async () => {}}
      />
    </I18nProvider>
  );
}

describe("SortWizard source persistence", () => {
  it("keeps the sources block in the DOM on Review so Gmail's runner stays registered", () => {
    const html = renderToStaticMarkup(wizardAt(3));
    expect(html).toContain("sort-sources-block");
    expect(html).toContain("hidden");
  });
});
