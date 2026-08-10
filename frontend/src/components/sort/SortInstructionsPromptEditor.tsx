import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AppSettings } from "../../types/settings";
import SortSystemPromptModal from "../SortSystemPromptModal";
import { SECONDARY_BTN_CLASS, PRIMARY_BTN_CLASS } from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";
import { fetchSortPromptDefault } from "../../api/sortPromptMeta";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";

interface SortInstructionsPromptEditorProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  backendOnline: boolean;
  collapsible?: boolean;
  embedded?: boolean;
}


/**
 * Inline custom instructions editor used inside the Custom instructions tab.
 * Renders the textarea and actions directly — no modal.
 */
function InlinePromptEditor({
  settings,
  onSettingsPatch,
  backendOnline,
}: Pick<SortInstructionsPromptEditorProps, "settings" | "onSettingsPatch" | "backendOnline">) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive();
  const [draft, setDraft] = useState(settings.sortSystemPrompt);
  const [builtin, setBuiltin] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);
  const isDirty = draft !== settings.sortSystemPrompt;

  useEffect(() => {
    setDraft(settings.sortSystemPrompt);
  }, [settings.sortSystemPrompt]);

  useEffect(() => {
    if (!backendOnline) return;
    let cancel = false;
    void (async () => {
      try {
        const d = await fetchSortPromptDefault();
        if (!cancel) setBuiltin(d);
      } catch (e: unknown) {
        if (!cancel) setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancel = true; };
  }, [backendOnline]);

  const handleSave = () => {
    onSettingsPatch({ sortSystemPrompt: draft });
    toast.message(t("queue.sortPromptSaved"), { duration: 3500 });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary leading-relaxed">
        {t(cloudSortActive ? "queue.sortPromptModalHelpCloud" : "queue.sortPromptModalHelp")}
      </p>
      {loadErr ? (
        <p className="text-xs text-warning" role="status">
          {t("queue.sortPromptBuiltinLoadError", { message: loadErr })}
        </p>
      ) : null}
      {builtin ? (
        <div>
          <button
            type="button"
            className="text-accent text-xs font-medium hover:underline"
            onClick={() => setShowReference((s) => !s)}
          >
            {showReference ? t("queue.sortPromptHideBuiltin") : t("queue.sortPromptShowBuiltin")}
          </button>
          {showReference ? (
            <pre className="mt-2 p-3 rounded-lg bg-bg-secondary border border-border text-2xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
              {builtin}
            </pre>
          ) : null}
        </div>
      ) : null}
      <label className="block">
        <span className="sr-only">{t("queue.sortPromptEditorLabel")}</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          placeholder={t("sortInstructionsStrip.customStripEmpty")}
          className="w-full min-h-[180px] rounded-lg border border-border bg-bg-primary px-3 py-2 font-mono text-2xs leading-relaxed text-text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          spellCheck={false}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!isDirty}
          onClick={handleSave}
          className={`${PRIMARY_BTN_CLASS} disabled:opacity-40`}
        >
          {t("queue.sortPromptSave")}
        </button>
        {isDirty ? (
          <button
            type="button"
            onClick={() => setDraft(settings.sortSystemPrompt)}
            className={SECONDARY_BTN_CLASS}
          >
            {t("queue.sortPromptClose")}
          </button>
        ) : null}
        {builtin ? (
          <button
            type="button"
            onClick={() => setDraft(builtin)}
            className={`${SECONDARY_BTN_CLASS} text-xs`}
          >
            {t("queue.sortPromptLoadDefault")}
          </button>
        ) : null}
        {draft.trim() ? (
          <button
            type="button"
            onClick={() => setDraft("")}
            className={`${SECONDARY_BTN_CLASS} text-xs`}
          >
            {t("queue.sortPromptUseBuiltin")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Custom sort instructions — shared by Settings and the sort strip.
 */
export function SortInstructionsPromptEditor({
  settings,
  onSettingsPatch,
  backendOnline,
  collapsible = false,
  embedded = false,
}: SortInstructionsPromptEditorProps) {
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);
  const hasCustom = Boolean(settings.sortSystemPrompt.trim());

  // embedded = Custom Instructions tab → render editor inline, no modal.
  if (embedded) {
    return (
      <InlinePromptEditor
        settings={settings}
        onSettingsPatch={onSettingsPatch}
        backendOnline={backendOnline}
      />
    );
  }

  const body = (
    <div className="space-y-3">
      <p className="text-2xs text-muted leading-relaxed">{t("settings.sortInstructions.hint")}</p>
      <p className="text-2xs text-text-secondary">
        {hasCustom ? t("settings.sortInstructions.customActive") : t("settings.sortInstructions.usingBuiltin")}
      </p>
      <button type="button" onClick={() => setModalOpen(true)} className={`${SECONDARY_BTN_CLASS} text-sm`}>
        {t("settings.sortInstructions.editButton")}
      </button>
    </div>
  );

  return (
    <>
      {collapsible ? (
        <details className="rounded-lg border border-border bg-bg-secondary/30">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-text-primary">
            {t("settings.sortInstructions.expertSummary")}
          </summary>
          <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">{body}</div>
        </details>
      ) : (
        <div className="rounded-lg border border-border bg-bg-secondary/30 px-3 py-3 space-y-1">
          <p className="text-sm font-medium text-text-primary">{t("settings.sortInstructions.expertSummary")}</p>
          {body}
        </div>
      )}
      <SortSystemPromptModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialValue={settings.sortSystemPrompt}
        onSave={(value) => {
          onSettingsPatch({ sortSystemPrompt: value });
          setModalOpen(false);
          toast.message(t("queue.sortPromptSaved"), { duration: 3500 });
        }}
        backendOnline={backendOnline}
      />
    </>
  );
}
