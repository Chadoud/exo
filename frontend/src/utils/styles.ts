/** Horizontal inset for main window content and title bar (matches tab panels + Settings scroll pane). */
export const APP_SHELL_GUTTER_X_CLASS = "px-5";

/**
 * Left padding on macOS Electron so fixed / full-bleed top chrome clears traffic lights.
 * Applied via `html.mac-traffic` in `tokens.css` — no-op in browser and on Windows.
 */
export const MAC_TRAFFIC_SAFE_PL_CLASS = "mac-traffic-safe-pl";

/**
 * Shared Tailwind class strings — avoids duplicating class lists across components.
 *
 * Conventions:
 * - Prefer semantic theme keys from tailwind.config (`border-border`, `bg-bg-card`, `bg-welcome-overlay`)
 *   over arbitrary `bg-[var(--…)]` / long `color-mix` in class strings so tokens stay consistent with light/dark.
 * - Add a named constant here when the same combo appears 3+ times or is a clear UI role (modal shell, primary CTA).
 * - Keep constants as static string literals so Tailwind JIT always sees full class names.
 */

/** One-line summary under a Settings group title (readable, scannable). */
export const SETTINGS_GROUP_SUMMARY_CLASS =
  "text-sm text-muted font-medium leading-relaxed max-w-prose mt-1.5";

export const SECTION_LABEL_CLASS =
  "block text-2xs font-semibold text-muted uppercase tracking-wider mb-2";

export const SECTION_TITLE_CLASS =
  "text-2xs font-bold uppercase tracking-widest text-muted group-hover:text-text-primary transition-colors";

/** Sidebar nested sub-tab (Memory / To Do / Settings children) when scroll-spy or route marks it active. */
export const SIDEBAR_SUBNAV_ACTIVE_CLASS = "bg-accent-muted text-accent font-semibold";

/** In-panel “On this page” nav (Settings) — matches sidebar sub-tab accent. */
export const PANEL_SIDE_NAV_ACTIVE_CLASS =
  "border-l-2 border-l-accent bg-accent-muted text-accent font-semibold";

export const PANEL_SIDE_NAV_INACTIVE_CLASS =
  "border-l-2 border-l-transparent text-text-primary hover:bg-hover-overlay";

export const CARD_SHELL_CLASS =
  "rounded-xl border border-border bg-bg-card";

/** SORT + VISION installed-model panels — stack until the column fits two table cards side by side. */
export const INSTALLED_MODELS_PANELS_GRID_CLASS =
  "grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 items-start [&>*]:min-w-0";

/** Fixed columns: model · disk · RAM · speed · actions */
export const INSTALLED_MODEL_ROW_GRID_CLASS =
  "grid grid-cols-[minmax(8rem,1.25fr)_3.25rem_4.5rem_5.5rem_5rem] gap-x-2 sm:gap-x-3 items-center px-3 sm:px-4";

/** Minimum table width before horizontal scroll inside a card (~480px). */
export const INSTALLED_MODEL_TABLE_INNER_CLASS = "min-w-[30rem]";

/**
 * Fixed chrome height for the Gmail “Search and limits” inset and the local workspace compact drop zone
 * so the two read as one row on wide layouts (Tailwind ``h-52`` = 13rem).
 */
export const WORKSPACE_SCAN_BLOCK_HEIGHT_CLASS =
  "h-52 min-h-52 max-h-52 sm:h-52 sm:min-h-52 sm:max-h-52";

/** Outer `<section>` for workspace connector sort blocks (Gmail, Drive, Box, …). */
export const WORKSPACE_SORT_BLOCK_SECTION_CLASS =
  "flex gap-3 items-start scroll-mt-28 min-h-0 w-full";

/**
 * Rounded card that wraps the checkbox + main panel for **Workspace** Gmail and Google Drive sort blocks.
 * (Same shell so both connectors look like one system.)
 */
export const WORKSPACE_CONNECTOR_CARD_SHELL_CLASS =
  "min-w-0 flex-1 rounded-xl border border-border bg-bg-card overflow-hidden shadow-sm shadow-black/[0.03] dark:shadow-black/15 flex flex-col";

/**
 * Tinted inner panel for connector filter controls — height follows content (no fixed scan block).
 */
export const WORKSPACE_CONNECTOR_TINTED_PANEL_CLASS =
  "rounded-lg border border-border bg-bg-secondary/40 px-3 pt-3 pb-3 space-y-3 min-w-0";

/**
 * Tinted inner panel with fixed scan height (local drop zone only).
 */
export const WORKSPACE_CONNECTOR_SCAN_PANEL_CLASS = `rounded-lg border border-border bg-bg-secondary/40 px-3 pt-3 pb-3 space-y-3 overflow-y-auto ${WORKSPACE_SCAN_BLOCK_HEIGHT_CLASS}`;

/** Drive workspace: filters only (no in-card file list) — no fixed list height. */
export const WORKSPACE_CONNECTOR_FILTERS_ONLY_PANEL_CLASS =
  "rounded-lg border border-border bg-bg-secondary/40 px-3 pt-3 pb-3 space-y-3 min-w-0";

/**
 * Stacked title + hint above a connector subsection (matches Gmail / Drive: title on the first line,
 * muted hint full-width on the line below, then a divider).
 */
export const WORKSPACE_CONNECTOR_SUBSECTION_HEADER_CLASS =
  "flex flex-col items-stretch gap-1 border-b border-border/70 pb-2";

export const WORKSPACE_CONNECTOR_SUBSECTION_TITLE_CLASS = "text-sm font-medium text-text-primary leading-tight";
export const WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS =
  "text-2xs text-muted font-normal leading-snug w-full block";

/**
 * Three-column form row used in workspace connector cards (Gmail “Search and limits”, Drive filters).
 * Labels on row 1, controls on row 2 — equal-width columns at `sm+`.
 */
export const WORKSPACE_CONNECTOR_FORM_GRID_CLASS =
  "w-full min-w-0 grid grid-cols-1 gap-y-2 gap-x-3 pt-2 sm:grid-cols-3";

/** Single-column stack: each field is label above control (narrow connector panels). */
export const WORKSPACE_CONNECTOR_FORM_STACK_CLASS =
  "w-full min-w-0 flex flex-col gap-3 pt-2";

/**
 * `text-sm` + `h-10` + `bg-bg-card` — matches ``GmailCategoryMaxRow`` native selects / date fields.
 */
export const WORKSPACE_CONNECTOR_CONTROL_CLASS =
  "w-full max-w-full rounded-lg border border-border bg-bg-card px-3 text-sm text-text-primary h-10 box-border disabled:opacity-50";

/** Native `<select>`: leave horizontal room for the dropdown chevron. */
export const WORKSPACE_CONNECTOR_SELECT_CLASS = `${WORKSPACE_CONNECTOR_CONTROL_CLASS} pr-8 py-0`;

export const GHOST_ICON_BTN_CLASS =
  "p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-hover-overlay disabled:opacity-40 transition-colors";

/** Standard secondary/ghost text button (toolbar, inline actions). */
export const SECONDARY_BTN_CLASS =
  "text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors";

/** Destructive inline action button (delete confirm, etc.). */
export const DANGER_INLINE_CLASS =
  "text-xs px-2 py-1 rounded-lg bg-error-strong border border-error-line text-error hover:bg-error-hover transition-colors font-medium";

/** Base class for status/speed badge chips — add color classes on top. */
export const BADGE_BASE_CLASS =
  "text-2xs font-semibold uppercase px-1.5 py-0.5 rounded-full border";

/** Capacity / metric table cells (SettingsModels comparison table). */
export const TABLE_CELL_LABEL = "py-1.5 text-muted";
export const TABLE_CELL_NUM = "py-1.5 text-right text-text-primary font-medium";
export const TABLE_CELL_MUTED_DASH = "py-1.5 text-right text-muted";

/** Collapsible section chevron (rotate state added in JSX). */
export const SECTION_CHEVRON_CLASS =
  "w-3.5 h-3.5 text-muted transition-transform duration-200 shrink-0";

/** Modal / dialog panel surface (add max-w-* and w-full in the component). */
export const MODAL_SURFACE_CLASS =
  "bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden";

export const MODAL_HEADER_ROW_CLASS =
  "flex items-center justify-between px-6 py-4 border-b border-border shrink-0";

export const MODAL_TITLE_CLASS = "font-semibold text-text-primary truncate min-w-0 mr-3";

export const MODAL_CLOSE_BUTTON_CLASS =
  "text-muted hover:text-text-primary transition-colors shrink-0";

export const MODAL_FOOTER_ROW_CLASS =
  "w-full px-6 py-4 flex flex-wrap items-center gap-2 sm:gap-3";

/** Primary call-to-action (welcome “Next” / “Start sorting”, accent actions). */
export const PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-button-primary hover:bg-button-hover text-white disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-accent-glow";

/** Secondary outline button often paired with primary (welcome “Back”). */
export const OUTLINE_PILL_BTN_CLASS =
  "px-4 py-2 rounded-xl text-sm font-medium border border-border text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors";

/** Cloud auth / compact elevated card. */
export const ELEVATED_CARD_CLASS =
  "rounded-2xl border border-border bg-bg-card p-6 space-y-4 shadow-lg";

/** Base for every confirm-dialog footer button (size, radius, transition — add a tone class on top). */
export const CONFIRM_DIALOG_FOOTER_BTN_CLASS =
  "inline-flex shrink-0 items-center justify-center min-h-[2.5rem] px-4 py-2 rounded-lg text-sm font-medium leading-snug transition-colors";

/** Neutral "keep/cancel" tone — always the non-destructive choice in a confirm dialog. */
export const CONFIRM_DIALOG_NEUTRAL_TONE_CLASS =
  "border border-border text-muted hover:text-text-primary hover:bg-hover-overlay";

/** Destructive confirm tone (disconnect, cancel sort, discard). */
export const CONFIRM_DIALOG_DANGER_TONE_CLASS =
  "border border-error-line bg-error-soft text-error hover:bg-error-hover";

/** Affirmative confirm tone (save, proceed). */
export const CONFIRM_DIALOG_PRIMARY_TONE_CLASS =
  "border border-accent bg-button-primary font-semibold text-white hover:bg-accent-hover";

