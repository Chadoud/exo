/**
 * MeetingModePanel — live meeting notes with end-of-meeting summary extraction.
 *
 * Start a session, capture what was said, and on end the backend distills
 * tasks + memories into the second brain.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addMeetingNote,
  endMeeting,
  fetchMeetingNotes,
  startMeeting,
  type MeetingSummary,
} from "../api/meetings";
import { useConversations } from "../hooks/useConversations";
import { useMeetingTranscription } from "../hooks/useMeetingTranscription";
import { useI18n } from "../i18n/I18nContext";
import { randomHexId } from "../utils/randomHexId";
import { EntitlementBlockedError } from "../api/client";
import MeetingLiveStatus from "./MeetingLiveStatus";
import ProUpgradeCard from "./ProUpgradeCard";

interface Props {
  backendOnline: boolean;
  onMeetingEnded?: (summary: MeetingSummary) => void;
  onOpenConversation?: () => void;
  /** False when the proactive (paid) tier is locked; gates starting a meeting. */
  proAllowed?: boolean;
  onUpgrade?: () => void;
  hideProCard?: boolean;
  /** Drop the inner card chrome when this panel already sits in a modal. */
  plain?: boolean;
  onSessionActiveChange?: (active: boolean) => void;
  bindEndSession?: (end: () => Promise<void>) => void;
}

const SYNC_INTERVAL_MS = 5000;

export default function MeetingModePanel({
  backendOnline,
  onMeetingEnded,
  onOpenConversation,
  proAllowed = true,
  onUpgrade,
  hideProCard = false,
  plain = false,
  onSessionActiveChange,
  bindEndSession,
}: Props) {
  const { t } = useI18n();
  const { setActive } = useConversations();
  const {
    recording: listening,
    issue: transcriptionIssue,
    start: startTranscription,
    stop: stopTranscription,
  } = useMeetingTranscription();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [recordAudio, setRecordAudio] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [lastSummary, setLastSummary] = useState<MeetingSummary | null>(null);
  const [proBlocked, setProBlocked] = useState(false);
  const proLocked = !proAllowed || proBlocked;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const syncNotes = useCallback(async (meetingId: string) => {
    const notes = await fetchMeetingNotes(meetingId, 80);
    if (notes.ok) setLines(notes.lines);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    onSessionActiveChange?.(Boolean(activeId));
    return () => onSessionActiveChange?.(false);
  }, [activeId, onSessionActiveChange]);

  const handleStart = async () => {
    const meetingTitle = title.trim() || t("meeting.defaultTitle");
    const id = randomHexId();
    setStarting(true);
    try {
      await startMeeting(id, meetingTitle);
      setActiveId(id);
      setLines([]);
      setLastSummary(null);
      stopPolling();
      pollRef.current = setInterval(() => {
        void syncNotes(id).catch(() => {});
      }, SYNC_INTERVAL_MS);
      if (recordAudio) {
        const { listening: didListen } = await startTranscription(id);
        toast.success(didListen ? t("meeting.toastRecordingStarted") : t("meeting.toastStarted"));
      } else {
        toast.success(t("meeting.toastStarted"));
      }
    } catch (e) {
      if (e instanceof EntitlementBlockedError) {
        setProBlocked(true);
      } else {
        toast.error(t("meeting.toastStartFailed"));
      }
    } finally {
      setStarting(false);
    }
  };

  const handleAddNote = async () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    try {
      const result = await addMeetingNote(activeId, text);
      setDraft("");
      if (result.line_count != null) {
        await syncNotes(activeId);
      }
    } catch {
      toast.error(t("meeting.toastAddFailed"));
    }
  };

  const handleEnd = useCallback(async () => {
    if (!activeId) return;
    setEnding(true);
    stopPolling();
    stopTranscription();
    try {
      const summary = await endMeeting(activeId);
      setLastSummary(summary);
      setActiveId(null);
      setLines([]);
      if (summary.skipped) {
        toast.message(t("meeting.toastTooShort"));
      } else {
        const tasks = summary.tasks_stored ?? 0;
        const tasksLabel = tasks
          ? ` · ${t(tasks === 1 ? "meeting.actionItemsSavedOne" : "meeting.actionItemsSavedOther", { n: tasks })}`
          : "";
        toast.success(summary.title ? `${summary.title}${tasksLabel}` : t("meeting.toastSaved"));
      }
      onMeetingEnded?.(summary);
    } catch {
      toast.error(t("meeting.toastEndFailed"));
    } finally {
      setEnding(false);
    }
  }, [activeId, onMeetingEnded, stopPolling, stopTranscription, t]);

  useEffect(() => {
    bindEndSession?.(() => handleEnd());
  }, [bindEndSession, handleEnd]);

  const handleRetryListening = async () => {
    if (!activeId || retrying) return;
    setRetrying(true);
    try {
      const { listening: didListen } = await startTranscription(activeId);
      if (didListen) toast.success(t("meeting.toastRecordingStarted"));
    } finally {
      setRetrying(false);
    }
  };

  if (!backendOnline) return null;

  return (
    <section className={plain ? "space-y-3" : "rounded-xl border border-border bg-bg-secondary p-4"}>
      <p className="max-w-md text-xs text-muted">{t("meeting.desc")}</p>

      {proLocked && !hideProCard ? (
        <div className="mt-3">
          <ProUpgradeCard
            compact
            description={t("pro.meetingFeature")}
            onUpgrade={() => onUpgrade?.()}
          />
        </div>
      ) : !activeId ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("meeting.titlePlaceholder")}
              className="min-w-[12rem] flex-1 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={starting}
              className="rounded-lg bg-button-primary px-4 py-2 text-sm font-medium text-white hover:bg-button-hover disabled:opacity-50"
            >
              {starting ? t("meeting.starting") : t("meeting.start")}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={recordAudio}
              onChange={(e) => setRecordAudio(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent"
            />
            {t("meeting.transcribeToggle")}
          </label>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <MeetingLiveStatus
            listening={listening}
            issue={transcriptionIssue}
            notesEmpty={lines.length === 0}
            listeningLabel={t("meeting.listening")}
            notesOnlyLabel={t("meeting.notesOnly")}
            micDeniedLabel={t("meeting.micDenied")}
            unavailableLabel={t("meeting.transcribeUnavailable")}
            retryLabel={t("meeting.retryListening")}
            emptyListeningLabel={t("meeting.notesEmptyListening")}
            retrying={retrying}
            onRetry={() => void handleRetryListening()}
          />
          <div className="flex gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddNote();
              }}
              placeholder={t("meeting.notePlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleAddNote()}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              {t("meeting.add")}
            </button>
          </div>

          {lines.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-bg-primary p-3">
              <ul className="space-y-1.5 text-xs text-text-secondary">
                {lines.slice(-20).map((line, i) => (
                  <li key={`${i}-${line.slice(0, 24)}`} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleEnd()}
            disabled={ending}
            className="w-full rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-500/90 disabled:opacity-50"
          >
            {ending ? t("meeting.ending") : t("meeting.end")}
          </button>
        </div>
      )}

      {lastSummary && !lastSummary.skipped && lastSummary.overview && (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-bg-primary p-3">
          <p className="text-sm font-medium text-text-primary">{lastSummary.title ?? t("meeting.summaryTitle")}</p>
          <p className="text-xs leading-relaxed text-muted">{lastSummary.overview}</p>
          {(lastSummary.action_items?.length ?? 0) > 0 && (
            <ul className="ml-4 list-disc text-xs text-text-secondary">
              {lastSummary.action_items!.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {lastSummary.id && onOpenConversation && (
            <button
              type="button"
              onClick={() => {
                setActive(lastSummary.id!);
                onOpenConversation();
              }}
              className="text-xs text-accent hover:underline"
            >
              {t("meeting.openInHistory")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
