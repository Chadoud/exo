import { useEffect, useState } from "react";
import type { EntitlementStatus } from "../api";
import type { PrimarySettingsSectionKey } from "../utils/settingsNav";
import {
  computeTrialLifecycleModal,
  markTrialNudgeSeen,
  readTrialNudgeSeen,
} from "../utils/trialLifecycleGate";
import TrialEndingNudgeModal from "./TrialEndingNudgeModal";
import TrialEndedGateModal from "./TrialEndedGateModal";

interface TrialLifecycleModalHostProps {
  entitlement: EntitlementStatus | null;
  /** Current top-level nav tab — the gate hides while the user is on Settings so they can reach the license field. */
  activeTab: string;
  openPrimarySettings: (section: PrimarySettingsSectionKey) => void;
}

/**
 * Decides between the one-time trial-ending nudge and the trial-ended gate, and renders
 * at most one of them. Replaces the old always-visible {@code TrialEndingBanner}.
 */
export default function TrialLifecycleModalHost({
  entitlement,
  activeTab,
  openPrimarySettings,
}: TrialLifecycleModalHostProps) {
  const [nudgeSeen, setNudgeSeen] = useState(readTrialNudgeSeen);

  const rawModal = computeTrialLifecycleModal(entitlement, nudgeSeen);
  // The gate's only escape hatch routes into Settings — don't block the very screen it sends them to.
  const modal = rawModal === "gate" && activeTab === "settings" ? "none" : rawModal;

  // Once the nudge condition is met, the decision is permanent even if entitlement briefly
  // refreshes back to a non-eligible state (e.g. license activated mid-modal).
  useEffect(() => {
    if (modal === "nudge") markTrialNudgeSeen();
  }, [modal]);

  const dismissNudge = () => {
    markTrialNudgeSeen();
    setNudgeSeen(true);
  };

  if (modal === "nudge" && entitlement) {
    return (
      <TrialEndingNudgeModal
        trialDaysRemaining={entitlement.trialDaysRemaining}
        onDismiss={dismissNudge}
      />
    );
  }

  if (modal === "gate") {
    return <TrialEndedGateModal onEnterLicenseKey={() => openPrimarySettings("license")} />;
  }

  return null;
}
