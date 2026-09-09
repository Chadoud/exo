import ModalShell from "./ModalShell";
import { MODAL_FOOTER_ROW_CLASS } from "../utils/styles";

const BTN =
  "inline-flex shrink-0 items-center justify-center min-h-[2.5rem] px-4 py-2 rounded-lg text-sm font-medium leading-snug transition-colors";

interface ScreenConsentModalProps {
  open: boolean;
  /** Gemini tool name, e.g. screen_capture or code_runner */
  tool: string | null;
  onAllow: () => void;
  /** Screen capture only: approve repeated captures for ~15 minutes without asking again. */
  onAllowSession?: () => void;
  /** Persist approval for this tool — future requests skip this modal. */
  onAlwaysAllow?: () => void;
  onDeny: () => void;
}

/**
 * User consent before sensitive tools run (screen capture, code execution, etc.).
 * Shared by voice HUD and chat autonomous-task progress.
 */
export default function ScreenConsentModal({
  open,
  tool,
  onAllow,
  onAllowSession,
  onAlwaysAllow,
  onDeny,
}: ScreenConsentModalProps) {
  if (!open || !tool) return null;

  const title =
    tool === "screen_capture"
      ? "Allow screen capture?"
      : tool === "code_runner"
        ? "Allow Python code to run?"
        : "Allow this action?";

  const message =
    tool === "screen_capture"
      ? "The assistant wants to capture your screen once and analyse it to help you. Nothing is stored unless you save it elsewhere."
      : tool === "code_runner"
        ? "The assistant wants to run Python code on your computer in a sandboxed subprocess (timeout limited). Only approve if you trust the generated code."
        : "The assistant requested a sensitive action that needs your confirmation.";

  return (
    <ModalShell
      title={title}
      onClose={onDeny}
      maxWidthClass="max-w-lg"
      footer={
        <div className={`${MODAL_FOOTER_ROW_CLASS} flex-col-reverse sm:flex-row sm:justify-end`}>
          <button
            type="button"
            onClick={onDeny}
            className={`${BTN} border border-border text-muted hover:text-text-primary hover:bg-hover-overlay`}
          >
            Deny
          </button>
          {tool === "screen_capture" && onAllowSession ? (
            <button
              type="button"
              onClick={onAllowSession}
              className={`${BTN} border border-border bg-bg-secondary text-text-primary hover:bg-hover-overlay`}
            >
              Allow for this session
            </button>
          ) : null}
          {onAlwaysAllow ? (
            <button
              type="button"
              onClick={onAlwaysAllow}
              className={`${BTN} border border-border bg-bg-secondary text-text-primary hover:bg-hover-overlay`}
            >
              Always allow
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAllow}
            className={`${BTN} border border-accent bg-button-primary font-semibold text-white hover:bg-accent-hover`}
          >
            Allow this time
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-primary leading-relaxed">{message}</p>
    </ModalShell>
  );
}
