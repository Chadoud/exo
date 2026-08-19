import { useMemo } from "react";
import FolderTree from "../FolderTree";
import type { FolderNode } from "../../api";
import { useI18n } from "../../i18n/I18nContext";

interface SortedFoldersTreeSectionProps {
  /** Job-scoped folder tree (only files sorted in this run). */
  folderTree: FolderNode[];
  folderViewMode: "rows" | "grid";
  onFolderViewModeChange: (mode: "rows" | "grid") => void;
  onOpenFolder: (path: string) => void;
  onRevealFile: (path: string) => void;
  /** Files in the current job — shown in the section subtitle. */
  jobFileCount: number;
}

function countTreeStats(tree: FolderNode[]): { folders: number; files: number } {
  const walk = (nodes: FolderNode[]): { folders: number; files: number } =>
    nodes.reduce(
      (acc, node) => {
        const childStats = walk(node.children ?? []);
        return {
          folders: acc.folders + 1 + childStats.folders,
          files: acc.files + node.files.length + childStats.files,
        };
      },
      { folders: 0, files: 0 },
    );
  return walk(tree);
}

/** Output folder tree for the current sort — same tree UI as Results, scoped to this job. */
export function SortedFoldersTreeSection({
  folderTree,
  folderViewMode,
  onFolderViewModeChange,
  onOpenFolder,
  onRevealFile,
  jobFileCount,
}: SortedFoldersTreeSectionProps) {
  const { t } = useI18n();
  const { folders: totalFolderNodes, files: totalFiles } = useMemo(
    () => countTreeStats(folderTree),
    [folderTree],
  );

  return (
    <section
      className="rounded-xl border border-border bg-bg-card overflow-hidden"
      aria-labelledby="sorted-folders-tree-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-bg-secondary/80 px-4 py-3">
        <div className="min-w-0">
          <h2 id="sorted-folders-tree-heading" className="text-base font-semibold text-text-primary">
            {t("overview.sortedFolders")}
            {folderTree.length > 0 ? (
              <span className="ml-2 text-xs font-normal text-muted">
                {totalFolderNodes === 1
                  ? t("overview.folderStatsOneFolder", { fileCount: totalFiles })
                  : t("overview.folderStats", {
                      folderCount: totalFolderNodes,
                      fileCount: totalFiles,
                    })}
              </span>
            ) : null}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {jobFileCount === 1
              ? t("queue.sortPlanFilesInJobOne")
              : t("queue.sortPlanFilesInJob", { count: jobFileCount })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFolderViewModeChange(folderViewMode === "rows" ? "grid" : "rows")}
          className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
          title={t("overview.viewToggleTitle")}
        >
          {t("overview.viewLabel", {
            mode: folderViewMode === "rows" ? t("overview.rows") : t("overview.grid"),
          })}
        </button>
      </div>

      <div className="min-h-[10rem] overflow-y-auto border-t border-border px-2 py-2">
        {folderTree.length > 0 ? (
          <FolderTree
            tree={folderTree}
            viewMode={folderViewMode}
            onOpenFolder={onOpenFolder}
            onRevealFile={onRevealFile}
          />
        ) : (
          <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <p className="text-sm font-medium text-text-primary">{t("overview.emptyTreeTitle")}</p>
            <p className="max-w-md text-xs leading-relaxed text-muted">
              {t("overview.treeAfterJobHint")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
