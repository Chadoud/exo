type SortStartChrome = "idle" | "inFlight" | "stopped" | "job";
export type SortStartStoppedReason = "failed" | "canceled";

/** Prep chrome after Run sort — leftover previewCount is never in-flight. */
export function resolveSortStartChrome(input: {
  hasJob: boolean;
  starting: boolean;
  awaitingFirstJob: boolean;
  stoppedReason: SortStartStoppedReason | null;
}): SortStartChrome {
  if (input.hasJob) return "job";
  if (input.starting || input.awaitingFirstJob) return "inFlight";
  if (input.stoppedReason) return "stopped";
  return "idle";
}
