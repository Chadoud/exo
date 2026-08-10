import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  MODAL_CLOSE_BUTTON_CLASS,
  MODAL_HEADER_ROW_CLASS,
  MODAL_SURFACE_CLASS,
  MODAL_TITLE_CLASS,
} from "../utils/styles";

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClass?: string;
  /**
   * False for interruptive "must choose" gates (e.g. trial-ended): suppresses Esc, backdrop
   * click, and the header close icon entirely — no dismiss affordance is rendered or wired,
   * rather than rendered-but-disabled, so it isn't discoverable as a dead end.
   */
  dismissible?: boolean;
}

export default function ModalShell({
  title,
  onClose,
  children,
  footer,
  maxWidthClass = "max-w-md",
  dismissible = true,
}: ModalShellProps) {
  const titleId = useId();

  useEffect(() => {
    if (!dismissible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dismissible, onClose]);

  /** Render on `document.body` so `fixed inset-0` is not clipped by `overflow-hidden` ancestors (e.g. settings `main`). */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        className={`${MODAL_SURFACE_CLASS} w-full ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
        role={dismissible ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header — always visible */}
        <div className={MODAL_HEADER_ROW_CLASS}>
          <h2 id={titleId} className={MODAL_TITLE_CLASS}>
            {title}
          </h2>
          {dismissible && (
            <button
              onClick={onClose}
              className={MODAL_CLOSE_BUTTON_CLASS}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Scrollable body — padding matches header/footer gutters */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer — single full-width top rule; footer slot adds horizontal padding via MODAL_FOOTER_ROW_CLASS */}
        {footer && (
          <div className="shrink-0 w-full border-t border-border bg-bg-card">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
