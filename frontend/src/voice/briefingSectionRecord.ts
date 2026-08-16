import type { BriefingSectionRecordOutcome } from "../features/assistant/chat/briefingOutcome";

export type BriefingSectionRecordPayload =
  | { kind: "section"; section: string; outcome: BriefingSectionRecordOutcome }
  | { kind: "tasks_honesty" };
