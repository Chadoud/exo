import { THEME_STORAGE_KEY } from "./constants";

/** Run before index.css so :root[data-theme] matches persisted preference on first paint (no flash / wrong token set). */
function applyStoredTheme(): void {
  let t: "dark" | "light" = "light";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    t = raw === "dark" || raw === "light" ? raw : "light";
  } catch {
    t = "light";
  }
  document.documentElement.dataset.theme = t;
  /* Native controls (<select>, scrollbars) follow OS; this nudges them toward the app theme in Electron. */
  document.documentElement.style.colorScheme = t;
}

applyStoredTheme();
