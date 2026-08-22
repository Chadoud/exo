import type { AppSettings } from "../../types/settings";
import SortInstructionsStrip from "../sort/instructions/SortInstructionsStrip";
import { Spinner } from "../Spinner";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "../../utils/styles";
import { QueueDesktopWorkspaceSection } from "./QueueDesktopWorkspaceSection";
import { QueueWebImportSection } from "./QueueWebImportSection";
import { SortWizardReviewStep } from "./SortWizardReviewStep";
import type { QueuePanelController } from "./useQueuePanelController";
import type { QueuePanelProps } from "./queuePanelProps";
import type { QueueActions } from "./queuePanelTypes";
import { SortWizardStepper } from "./SortWizardStepper";
import { QueueSortStartStoppedHint } from "./QueueSortStartStoppedHint";

type SortWizardProps = Pick<QueuePanelProps, "settings" | "workspaceExternalSources"> &
  Pick<
    QueuePanelController,
    | "t"
    | "currentJob"
    | "sortInputDisabled"
    | "sortInputDisabledReason"
    | "workspaceBatch"
    | "sendingWithoutJobYet"
    | "prepProgressMode"
    | "prepStallHint"
    | "prepStallTranslationKey"
    | "jobMetrics"
    | "sortWizard"
    | "sortStartChrome"
  > & {
    onSettingsPatch: (patch: Partial<AppSettings>) => void;
    backendOnline: boolean;
    onFiles: QueueActions["onFiles"];
    onBrowserFiles: QueueActions["onBrowserFiles"];
  };

/** Pre-sort 3-step wizard — Sources, Structure, Review & confirm. */
export function SortWizard({
  settings,
  workspaceExternalSources,
  t,
  currentJob,
  sortInputDisabled,
  sortInputDisabledReason,
  workspaceBatch,
  sendingWithoutJobYet,
  prepProgressMode,
  prepStallHint,
  prepStallTranslationKey,
  jobMetrics,
  sortWizard,
  sortStartChrome,
  onSettingsPatch,
  backendOnline,
  onFiles,
  onBrowserFiles,
}: SortWizardProps) {
  const { wizardStep, goNext, goBack, goToStep, canGoNext } = sortWizard;
  const {
    desktop,
    selectedSourcesSummary,
    handleRunWorkspaceBatch,
    handleCancelWorkspaceBatchStart,
    workspaceBatchDisabled,
    workspaceRunBatchDisabledHint,
    workspaceBatchStarting,
    hasSourceSelected,
    sortStartStoppedReason,
  } = workspaceBatch;
  const hideChrome = sortStartChrome === "inFlight";
  const stoppedReason = sortStartChrome === "stopped" ? sortStartStoppedReason : null;

  const sectionProps = {
    workspaceExternalSources,
    t,
    currentJob,
    sortInputDisabled,
    sortInputDisabledReason,
    workspaceBatch,
    hideWorkspaceCardsRow: false,
    sendingWithoutJobYet,
    prepProgressMode,
    prepStallHint,
    prepStallTranslationKey,
    jobMetrics,
    hideRunRow: true,
  };

  return (
    <div className="space-y-4" data-testid="sort-wizard">
      <div hidden={hideChrome} inert={hideChrome || undefined}>
        <SortWizardStepper
          step={wizardStep}
          hasSourceSelected={hasSourceSelected}
          onStepClick={goToStep}
          t={t}
        />

        <div className="min-w-0">
          {/* Keep sources mounted on later steps. Unmounting Gmail's block
            unregisters the mail-only runner, so Run sort on Review would toast
            "Gmail is not ready to run from here yet." */}
          <div hidden={wizardStep !== 1} data-tour="workspace-sort-sources">
            {desktop ? (
              <QueueDesktopWorkspaceSection {...sectionProps} />
            ) : (
              <QueueWebImportSection {...sectionProps} onFiles={onFiles} onBrowserFiles={onBrowserFiles} />
            )}
          </div>

          {wizardStep === 2 ? (
            <SortInstructionsStrip
              settings={settings}
              onSettingsPatch={onSettingsPatch}
              backendOnline={backendOnline}
            />
          ) : null}

          {wizardStep === 3 ? (
            <SortWizardReviewStep settings={settings} selectedSourcesSummary={selectedSourcesSummary} />
          ) : null}
        </div>
      </div>

      {stoppedReason && !hideChrome ? <QueueSortStartStoppedHint reason={stoppedReason} t={t} /> : null}

      <div hidden={hideChrome} inert={hideChrome || undefined} className="flex flex-wrap items-center justify-center gap-3 pt-1">
        {wizardStep > 1 ? (
          <button type="button" onClick={goBack} className={`${SECONDARY_BTN_CLASS} min-w-[7rem] px-5`}>
            {t("queue.sortWizardBack")}
          </button>
        ) : null}

        {wizardStep < 3 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className={`${PRIMARY_BTN_CLASS} min-w-[7rem] px-5`}
          >
            {t("queue.sortWizardNext")}
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="workspace-run-sort"
              data-tour="run-sort"
              onClick={() => void handleRunWorkspaceBatch()}
              disabled={workspaceBatchDisabled}
              title={workspaceRunBatchDisabledHint}
              aria-busy={workspaceBatchStarting}
              className={`${PRIMARY_BTN_CLASS} min-w-[12rem] px-6 ${workspaceBatchStarting ? "disabled:opacity-100 disabled:cursor-wait" : ""}`}
            >
              {workspaceBatchStarting ? (
                <>
                  <Spinner className="w-4 h-4 text-white shrink-0" aria-hidden />
                  <span>{t("queue.workspaceRunBatchStarting")}</span>
                </>
              ) : (
                t("queue.workspaceRunBatch")
              )}
            </button>
            {workspaceBatchStarting ? (
              <button
                type="button"
                onClick={handleCancelWorkspaceBatchStart}
                className={`${SECONDARY_BTN_CLASS} px-4`}
              >
                {t("queue.workspaceRunBatchCancel")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
