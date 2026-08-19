import { toast } from "sonner";

/** Success toast with an Undo action — same pattern as memory bulk discard. */
export function announceUndoable(message: string, undoLabel: string, onUndo: () => void): void {
  toast.success(message, {
    duration: 8000,
    action: { label: undoLabel, onClick: onUndo },
    className: "app-sonner-toast-action",
  });
}
