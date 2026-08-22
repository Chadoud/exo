import type { FileEntry, GmailAnalyzeSlice, Job } from "../../api";
import type { ReviewRow } from "../../utils/jobView";
import type { BrowserUploadContext } from "../../utils/analysisModelReadiness";

export interface QueueJobState {
  currentJob: Job | null;
  sessionId: string | null;
  isRunning: boolean;
  isAwaitingApproval: boolean;
  totalCount: number;
  processedCount: number;
  failedFiles: FileEntry[];
  /** Gmail attachment download failures during import (not pipeline ``error`` rows). */
  fetchFailureCount: number;
  reviewRows: ReviewRow[];
}

export interface QueueActions {
  onFiles: (paths: string[]) => Promise<void>;
  /** Desktop: explicit chooser — ignores Workspace merge ref for this run. */
  onStartExplicitLocalSort?: (
    paths: string[],
    gmail: GmailAnalyzeSlice | null,
    opts?: { signal?: AbortSignal; importSources?: string[] }
  ) => Promise<string | null>;
  /** Always-mounted Gmail-only start — Review must not depend on the Sources card runner. */
  onStartGmailOnlySort?: (
    slice: GmailAnalyzeSlice,
    opts?: { signal?: AbortSignal }
  ) => Promise<string | null>;
  /** Desktop progressive Drive: starts ``/analyze/drive-stream`` with optional local paths, then posts chunks. */
  onStartProgressiveDriveSort?: (
    initialFilePaths: string[],
    opts?: {
      signal?: AbortSignal;
      gmailSlice?: GmailAnalyzeSlice | null;
      importSources?: string[];
    }
  ) => Promise<{ job_id: string; session_id: string } | null>;
  onBrowserFiles?: (files: File[], context?: BrowserUploadContext) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
  onRetryFailed: () => Promise<void>;
  onRetryDriveDownloads: () => Promise<void>;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onApplyApproved: () => Promise<void>;
  onUpdateReviewRow: (path: string, patch: Partial<FileEntry>) => void;
  onUndoEntry: (entryId: string) => Promise<void>;
  onUndoAll: () => Promise<void>;
  /** Clear completed job UI and return to source picker. */
  onStartNewSort: () => void;
  onReassignFile: (file: FileEntry) => void;
  onOpenOutputSettings: () => void;
  onOpenAccountSettings: () => void;
  onOpenLicenseSettings: () => void;
  onGoToOverview: () => void;
  onGoToHistory: () => void;
}
