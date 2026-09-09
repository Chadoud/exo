import { CAPTURE_SUB_TAB_STORAGE_KEY } from "../constants";

export type CaptureSubTab = "meeting" | "activity";

export function loadCaptureSubTab(): CaptureSubTab {
  try {
    const v = localStorage.getItem(CAPTURE_SUB_TAB_STORAGE_KEY);
    if (v === "meeting" || v === "activity") return v;
  } catch {
    /* ignore */
  }
  return "meeting";
}

export function persistCaptureSubTab(tab: CaptureSubTab): void {
  try {
    localStorage.setItem(CAPTURE_SUB_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}
