import type { SortWizardStep } from "./useSortWizard";

const WIZARD_STEPS: SortWizardStep[] = [1, 2, 3];

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type SortWizardStepperProps = {
  step: SortWizardStep;
  hasSourceSelected: boolean;
  onStepClick: (target: SortWizardStep) => void;
  t: TranslateFn;
};

function isStepUnlocked(target: SortWizardStep, hasSourceSelected: boolean): boolean {
  if (target === 1) return true;
  return hasSourceSelected;
}

function StepCheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.2 6.4 11.1 12.5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Connected horizontal stepper — no card chrome, accent progress track. */
export function SortWizardStepper({ step, hasSourceSelected, onStepClick, t }: SortWizardStepperProps) {
  const stepLabels: Record<SortWizardStep, string> = {
    1: t("queue.sortWizardStepSources"),
    2: t("queue.sortWizardStepStructure"),
    3: t("queue.sortWizardStepReview"),
  };

  return (
    <nav aria-label={t("queue.sortWizardNavLabel")} className="w-full px-1 mb-8">
      <ol className="flex w-full items-center">
        {WIZARD_STEPS.map((id, index) => {
          const active = step === id;
          const complete = step > id;
          const unlocked = isStepUnlocked(id, hasSourceSelected);
          const navigable = unlocked && !active;

          return (
            <li key={id} className={`flex items-center ${index < WIZARD_STEPS.length - 1 ? "flex-1" : ""}`}>
              <button
                type="button"
                onClick={() => {
                  if (navigable) onStepClick(id);
                }}
                disabled={!navigable && !active}
                aria-current={active ? "step" : undefined}
                aria-disabled={!unlocked || undefined}
                title={
                  !unlocked
                    ? t("queue.sortWizardStepLockedHint")
                    : navigable
                      ? t("queue.sortWizardStepGoTo", { step: stepLabels[id] })
                      : undefined
                }
                className={`group flex shrink-0 flex-row items-center gap-2 rounded-lg px-1 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary ${
                  navigable ? "cursor-pointer" : active ? "cursor-default" : "cursor-not-allowed"
                }`}
              >
                <span
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-all duration-200 ${
                    active
                      ? "bg-accent text-white shadow-[0_0_0_4px] shadow-accent/20"
                      : complete
                        ? "bg-accent text-white group-hover:brightness-110"
                        : unlocked
                          ? "border-2 border-accent/50 bg-bg-primary text-accent group-hover:border-accent group-hover:bg-accent/5"
                          : "border-2 border-border bg-bg-primary text-muted"
                  }`}
                  aria-hidden
                >
                  {complete ? <StepCheckIcon /> : id}
                </span>
                <span
                  className={`whitespace-nowrap text-2xs font-medium leading-none transition-colors sm:text-xs ${
                    active
                      ? "text-text-primary"
                      : complete || unlocked
                        ? "text-text-secondary group-hover:text-text-primary"
                        : "text-muted"
                  }`}
                >
                  {stepLabels[id]}
                </span>
              </button>

              {index < WIZARD_STEPS.length - 1 ? (
                <div
                  className="mx-1 h-px min-w-[1.25rem] flex-1 sm:mx-2"
                  aria-hidden
                  role="presentation"
                >
                  <div
                    className={`h-full rounded-full transition-colors duration-300 ${
                      step > id ? "bg-accent" : "bg-border"
                    }`}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
