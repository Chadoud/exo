import { useCallback, useState } from "react";
import {
  clearTrialGateDismissed,
  markTrialGateDismissed,
  readTrialGateDismissed,
} from "../utils/trialLifecycleGate";

/**
 * Shared "Continue with limited access" decision: the trial-ended gate and the
 * workspace upgrade banner live in different parts of the shell but must agree
 * on it. Session-scoped — the gate returns on next launch.
 */
export function useTrialGateDismissal() {
  const [gateDismissed, setGateDismissed] = useState(readTrialGateDismissed);

  const continueLimited = useCallback(() => {
    markTrialGateDismissed();
    setGateDismissed(true);
  }, []);

  const reopenGate = useCallback(() => {
    clearTrialGateDismissed();
    setGateDismissed(false);
  }, []);

  return { gateDismissed, continueLimited, reopenGate };
}
