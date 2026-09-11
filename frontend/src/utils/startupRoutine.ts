/** Voice startup routine + consent — same keys the backend already reads. */

export const STARTUP_ROUTINE_KEY = "startup_routine";
export const STARTUP_CONSENT_KEY = "startup_briefing_consent";
export const STARTUP_CONSENT_V2_KEY = "startup_briefing_consent_v2";

export type StartupOffer = "ask" | "always" | "never";

export type StartupSections = {
  calendar: boolean;
  mail: boolean;
  news: boolean;
  weather: boolean;
  city: string;
};

const CITY_RE =
  /\b(?:weather|météo|meteo|wetter)\s+(?:for|in|de|à|a|für|fur)\s+([A-Za-zÀ-ÿ\s-]{2,30}?)(?:\s*,|\s*\.|\s+and\b|$)/i;

export function emptyStartupSections(): StartupSections {
  return { calendar: false, mail: false, news: false, weather: false, city: "" };
}

export function parseStartupRoutine(routine: string): StartupSections {
  const lower = routine.trim().toLowerCase();
  if (!lower || lower === "none") return emptyStartupSections();
  const city = CITY_RE.exec(routine)?.[1]?.trim() ?? "";
  return {
    // Same substrings as backend SECTION_REGISTRY so Include matches spoken Brief.
    calendar: /calendar|event|agenda|task|schedule|meeting|tâche|tache/.test(lower),
    mail: /email|mail|gmail|unread|message|inbox|outlook/.test(lower),
    news: /news|headline|actualit|nachrichten|nouvelles/.test(lower),
    weather: /weather|météo|meteo|wetter|climat/.test(lower),
    city,
  };
}

export function composeStartupRoutine(sections: StartupSections): string {
  const parts: string[] = [];
  if (sections.calendar) parts.push("calendar");
  if (sections.mail) parts.push("email");
  if (sections.news) parts.push("news");
  if (sections.weather) {
    const city = sections.city.trim();
    parts.push(city ? `weather for ${city}` : "weather");
  }
  return parts.length > 0 ? parts.join(" and ") : "none";
}

export function parseStartupOffer(consent: string | undefined): StartupOffer {
  const value = (consent ?? "").trim().toLowerCase();
  if (value === "granted") return "always";
  if (value === "declined") return "never";
  return "ask";
}
