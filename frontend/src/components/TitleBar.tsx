import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Theme } from "../hooks/useTheme";
import type { UiLocale } from "../types/settings";
import { isMacElectronClient, isWindowsElectronClient } from "../utils/platform";
import { LiveStatusPill } from "./ui/StatusBadge";
import { modShortcutLabel } from "../utils/platform";
import { useI18n } from "../i18n/I18nContext";
import { UI_LOCALES, UI_LOCALE_META } from "../i18n/locale";
import SelectDropdown, {
  SELECT_DROPDOWN_PANEL_CLASS,
  selectDropdownPlainOptionClassName,
} from "./ui/SelectDropdown";
import { APP_SHELL_GUTTER_X_CLASS } from "../utils/styles";
import { APP_LOGO_URL } from "../constants";
import WindowChromeButtons from "./WindowChromeButtons";

type WindowsTitleBrandingPlacement = "titleBar" | "sidebar";

/** App icon + product line (Windows Electron custom chrome — sidebar vs title row). */
export function WindowsTitleBranding({
  productLabel,
  placement = "titleBar",
  /** When set, shown next to the app mark instead of the product name (e.g. header clock). */
  labelSlot,
  /** macOS sidebar: clock only — icon clips traffic lights. */
  showMark = !(placement === "sidebar" && isMacElectronClient()),
}: {
  productLabel: string;
  placement?: WindowsTitleBrandingPlacement;
  labelSlot?: ReactNode;
  showMark?: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  const mark = (
    <span className="relative w-7 h-7 shrink-0 overflow-hidden flex items-center justify-center">
      {!logoFailed ? (
        <img
          src={APP_LOGO_URL}
          alt=""
          width={28}
          height={28}
          className="w-full h-full object-contain pointer-events-none"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <svg
          className="w-4 h-4 text-accent"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.39 2.169v6.305A2.25 2.25 0 0 0 5.25 21h13.5a2.25 2.25 0 0 0 2.25-2.25v-6.305a2.25 2.25 0 0 0-1.39-2.169m-16.5 0V6.75A2.25 2.25 0 0 1 5.25 4.5h3.379a2.25 2.25 0 0 1 1.59.659l.88.88A2.25 2.25 0 0 0 12.69 6.75h6.81a2.25 2.25 0 0 1 2.25 2.25v.776"
          />
        </svg>
      )}
    </span>
  );

  const labelSection = labelSlot ?? (
    <span
      className={
        placement === "sidebar"
          ? "text-xs font-semibold text-text-primary leading-snug truncate min-w-0"
          : "text-sm font-semibold text-text-primary tracking-tight truncate select-none"
      }
      title={productLabel}
    >
      {productLabel}
    </span>
  );

  if (placement === "sidebar") {
    const sidebarPaddingClass = isMacElectronClient() ? "pr-2 py-2" : "px-2 py-2";
    const labelWrapClass = labelSlot ? "shrink-0" : "min-w-0 flex-1";
    return (
      <div
        className={`flex flex-row items-center justify-start gap-2 w-full min-w-0 ${sidebarPaddingClass} select-none`}
        title={labelSlot ? undefined : productLabel}
      >
        {showMark ? mark : null}
        <div className={`${labelWrapClass} flex flex-col justify-center`}>{labelSection}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0 mr-2 min-w-0">
      {showMark ? mark : null}
      {labelSlot ? (
        <div className="min-w-0 flex-1 flex flex-col justify-center">{labelSection}</div>
      ) : (
        labelSection
      )}
    </div>
  );
}

interface TitleBarProps {
  backendOnline: boolean;
  /** Startup fast-retry window — show “Checking…” instead of premature Offline. */
  backendHealthProbing?: boolean;
  /** Managed backend process is up but /health is not ready yet (PyInstaller cold start). */
  backendServiceStarting?: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenHelp: () => void;
  uiLocale: UiLocale;
  onUiLocaleChange: (locale: UiLocale) => void;
  /** Restart local API (Electron). Omit to hide Retry when offline. */
  onRetryBackend?: () => void | Promise<void>;
  /** When cloud auth is active and the user is signed in, show email in the title area. */
  cloudAccountLabel?: string;
  /** Full tooltip when label differs from email (name + email). */
  cloudAccountTitle?: string;
  /**
   * Hide the draggable leading block (logo + product name).
   * Used when branding + clock live in the shell corner (Windows / AI Manager Exo).
   */
  suppressLeadingBranding?: boolean;
}

export default function TitleBar({
  backendOnline,
  backendHealthProbing = false,
  backendServiceStarting = false,
  theme,
  onToggleTheme,
  onOpenHelp,
  uiLocale,
  onUiLocaleChange,
  onRetryBackend,
  cloudAccountLabel,
  cloudAccountTitle,
  suppressLeadingBranding = false,
}: TitleBarProps) {
  const { t } = useI18n();
  const [localeMenuOpen, setLocaleMenuOpen] = useState(false);
  const localeTriggerRef = useRef<HTMLButtonElement>(null);
  /** Windows + macOS Electron use the nav-rail corner; browser shows mark + name here. */
  const showTitleBarBranding = !isWindowsElectronClient() && !isMacElectronClient();
  const mod = modShortcutLabel();

  return (
    <header
      className={`app-titlebar flex items-center gap-3 ${APP_SHELL_GUTTER_X_CLASS} py-3 bg-bg-secondary border-b border-border shrink-0 select-none`}
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      {/* Draggable area — logo + name unless suppressed (shown in sidebar on AI Manager / Windows). */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {!suppressLeadingBranding && showTitleBarBranding ? (
          <WindowsTitleBranding productLabel={t("titleBar.appName")} placement="titleBar" />
        ) : null}
        {cloudAccountLabel ? (
          <span
            className="hidden md:inline text-2xs text-muted truncate max-w-[min(14rem,28vw)]"
            title={cloudAccountTitle ?? cloudAccountLabel}
          >
            {cloudAccountLabel}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-tour="header-help"
          onClick={onOpenHelp}
          className="p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors flex items-center justify-center"
          title={t("titleBar.helpTitle", { modifier: mod })}
          aria-label={t("titleBar.helpAria")}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
            />
          </svg>
        </button>

        {/* Theme toggle (sun / moon) — same compact control size as Cost / Help */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors flex items-center justify-center"
          title={theme === "dark" ? t("titleBar.themeLight") : t("titleBar.themeDark")}
          aria-label={theme === "dark" ? t("titleBar.themeLight") : t("titleBar.themeDark")}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {theme === "dark" ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          )}
        </button>

        {/* Backend status — Retry respawns Python API in Electron if it died (port conflict / crash). */}
        {backendHealthProbing || backendServiceStarting ? (
          <LiveStatusPill variant="checking" size="sm">
            {backendServiceStarting ? t("api.startingTitleBar") : t("api.checking")}
          </LiveStatusPill>
        ) : backendOnline ? (
          <LiveStatusPill variant="online" size="sm">
            {t("api.ready")}
          </LiveStatusPill>
        ) : (
          <div className="flex items-center gap-1">
            <LiveStatusPill variant="offline" size="sm">
              {t("api.offline")}
            </LiveStatusPill>
            {typeof onRetryBackend === "function" && (
              <button
                type="button"
                onClick={() => void onRetryBackend()}
                className="text-2xs font-semibold px-2 py-0.5 rounded-md bg-error-strong/80 text-error hover:bg-error-strong border border-error-line transition-colors"
                title={t("titleBar.retryApi")}
                aria-label={t("titleBar.retryApiAria")}
                style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
              >
                {t("titleBar.retryApi")}
              </button>
            )}
          </div>
        )}

        <div className="min-w-0 w-[min(8.5rem,100%)] shrink" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
          <label className="sr-only" htmlFor="app-ui-locale">
            {t("titleBar.language")}
          </label>
          <SelectDropdown
            open={localeMenuOpen}
            onOpenChange={setLocaleMenuOpen}
            triggerRef={localeTriggerRef}
            triggerId="app-ui-locale"
            triggerLabel={UI_LOCALE_META[uiLocale].native}
            ariaLabel={t("titleBar.language")}
            triggerClassName="!py-1.5 !px-2 !text-2xs !gap-1.5 max-w-[8.5rem]"
            portaled
          >
            <div role="listbox" aria-label={t("titleBar.language")} className={SELECT_DROPDOWN_PANEL_CLASS}>
              {UI_LOCALES.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  role="option"
                  aria-selected={uiLocale === loc}
                  onClick={() => {
                    onUiLocaleChange(loc);
                    setLocaleMenuOpen(false);
                  }}
                  className={selectDropdownPlainOptionClassName(uiLocale === loc, "compact")}
                >
                  {UI_LOCALE_META[loc].native}
                </button>
              ))}
            </div>
          </SelectDropdown>
        </div>
      </div>

      <WindowChromeButtons className="ml-1" />
    </header>
  );
}
