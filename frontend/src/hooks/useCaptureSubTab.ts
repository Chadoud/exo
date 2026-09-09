import { useCallback, useState } from "react";
import { loadCaptureSubTab, persistCaptureSubTab, type CaptureSubTab } from "../utils/captureUi";

export function useCaptureSubTab() {
  const [captureSubTab, setCaptureSubTab] = useState<CaptureSubTab>(loadCaptureSubTab);

  const selectCaptureSubTab = useCallback((tab: CaptureSubTab) => {
    persistCaptureSubTab(tab);
    setCaptureSubTab(tab);
  }, []);

  return { captureSubTab, selectCaptureSubTab };
}
