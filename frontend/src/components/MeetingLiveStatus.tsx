import type { MeetingTranscriptionIssue } from "../utils/meetingTranscriptionIssue";

interface MeetingLiveStatusProps {
  listening: boolean;
  issue: MeetingTranscriptionIssue | null;
  notesEmpty: boolean;
  listeningLabel: string;
  notesOnlyLabel: string;
  micDeniedLabel: string;
  unavailableLabel: string;
  retryLabel: string;
  emptyListeningLabel: string;
  retrying?: boolean;
  onRetry: () => void;
}

export default function MeetingLiveStatus({
  listening,
  issue,
  notesEmpty,
  listeningLabel,
  notesOnlyLabel,
  micDeniedLabel,
  unavailableLabel,
  retryLabel,
  emptyListeningLabel,
  retrying = false,
  onRetry,
}: MeetingLiveStatusProps) {
  return (
    <div className="space-y-3">
      <span
        role="status"
        className={
          listening
            ? "inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-400"
            : "inline-flex items-center gap-1.5 rounded-full bg-bg-primary px-2.5 py-1 text-[11px] font-medium text-muted ring-1 ring-border"
        }
      >
        {listening ? (
          <span className="h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-muted" />
        )}
        {listening ? listeningLabel : notesOnlyLabel}
      </span>

      {issue && (
        <div className="space-y-2" role="alert">
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            {issue === "mic_denied" ? micDeniedLabel : unavailableLabel}
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
          >
            {retryLabel}
          </button>
        </div>
      )}

      {listening && !issue && notesEmpty && (
        <p className="text-xs text-muted" aria-live="polite">
          {emptyListeningLabel}
        </p>
      )}
    </div>
  );
}
