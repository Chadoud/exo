import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchMemory, upsertMemoryEntry } from "../../api/memory";
import { useI18n } from "../../i18n/I18nContext";
import ListSkeleton from "../ui/ListSkeleton";
import EmptyState from "../ui/EmptyState";
import { CARD_SHELL_CLASS } from "../../utils/styles";
import {
  STARTUP_CONSENT_KEY,
  STARTUP_CONSENT_V2_KEY,
  STARTUP_ROUTINE_KEY,
  composeStartupRoutine,
  emptyStartupSections,
  parseStartupOffer,
  parseStartupRoutine,
  type StartupOffer,
  type StartupSections,
} from "../../utils/startupRoutine";

type StartupIncludePaneProps = {
  backendOnline: boolean;
};

type LoadState = "loading" | "ready" | "error";

type SectionKey = keyof Omit<StartupSections, "city">;

async function persistSections(sections: StartupSections): Promise<void> {
  await upsertMemoryEntry("preferences", STARTUP_ROUTINE_KEY, composeStartupRoutine(sections));
}

async function persistOffer(offer: StartupOffer): Promise<void> {
  if (offer === "always") {
    await upsertMemoryEntry("preferences", STARTUP_CONSENT_KEY, "granted");
    await upsertMemoryEntry("preferences", STARTUP_CONSENT_V2_KEY, "1");
    return;
  }
  if (offer === "never") {
    await upsertMemoryEntry("preferences", STARTUP_CONSENT_KEY, "declined");
    return;
  }
  await upsertMemoryEntry("preferences", STARTUP_CONSENT_KEY, "ask");
}

const OFFER_OPTIONS = [
  ["ask", "startup.offerAsk"],
  ["always", "startup.offerAlways"],
  ["never", "startup.offerNever"],
] as const;

export default function StartupIncludePane({ backendOnline }: StartupIncludePaneProps) {
  const { t } = useI18n();
  const [sections, setSections] = useState<StartupSections>(emptyStartupSections);
  const [offer, setOffer] = useState<StartupOffer>("ask");
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const loadPrefs = useCallback(() => {
    if (!backendOnline) return;
    setLoadState("loading");
    void fetchMemory()
      .then((store) => {
        setSections(parseStartupRoutine(store.preferences[STARTUP_ROUTINE_KEY] ?? ""));
        setOffer(parseStartupOffer(store.preferences[STARTUP_CONSENT_KEY]));
        setLoadState("ready");
      })
      .catch(() => {
        setLoadState("error");
      });
  }, [backendOnline]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const saveSections = async (next: StartupSections, previous: StartupSections) => {
    setSections(next);
    try {
      await persistSections(next);
    } catch {
      setSections(previous);
      toast.error(t("startup.saveFailed"));
    }
  };

  const saveOffer = async (next: StartupOffer) => {
    const previous = offer;
    setOffer(next);
    try {
      await persistOffer(next);
    } catch {
      setOffer(previous);
      toast.error(t("startup.saveFailed"));
    }
  };

  const toggle = (key: SectionKey) => {
    if (loadState !== "ready" || !backendOnline) return;
    void saveSections({ ...sections, [key]: !sections[key] }, sections);
  };

  const saveCity = () => {
    if (loadState !== "ready" || !backendOnline) return;
    void saveSections(sections, sections);
  };

  const rows: { key: SectionKey; title: string; hint: string }[] = [
    { key: "calendar", title: t("startup.sectionCalendar"), hint: t("startup.sectionCalendarHint") },
    { key: "mail", title: t("startup.sectionMail"), hint: t("startup.sectionMailHint") },
    { key: "news", title: t("startup.sectionNews"), hint: t("startup.sectionNewsHint") },
    { key: "weather", title: t("startup.sectionWeather"), hint: t("startup.sectionWeatherHint") },
  ];

  const disabled = !backendOnline || loadState !== "ready";

  if (backendOnline && loadState === "loading") {
    return <ListSkeleton rows={4} busyLabel={t("startup.loadingInclude")} />;
  }

  if (backendOnline && loadState === "error") {
    return (
      <EmptyState
        title={t("startup.loadFailed")}
        primaryAction={{ label: t("startup.retry"), onClick: loadPrefs }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t("startup.includeLead")}</p>
      <ul className={`${CARD_SHELL_CLASS} divide-y divide-border overflow-hidden`}>
        {rows.map((row) => (
          <li key={row.key}>
            <label className={`flex items-start gap-3 px-3 py-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                className="mt-1 rounded border-border text-accent focus:ring-accent shrink-0"
                checked={sections[row.key]}
                disabled={disabled}
                onChange={() => toggle(row.key)}
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">{row.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{row.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {sections.weather ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-primary">{t("startup.cityLabel")}</span>
          <input
            type="text"
            value={sections.city}
            disabled={disabled}
            placeholder={t("startup.cityPlaceholder")}
            onChange={(event) => setSections({ ...sections, city: event.target.value })}
            onBlur={saveCity}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveCity();
              }
            }}
            className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          />
        </label>
      ) : null}
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium text-text-primary">{t("startup.offerTitle")}</legend>
        {OFFER_OPTIONS.map(([value, key]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
            <input
              type="radio"
              name="startup-offer"
              checked={offer === value}
              disabled={disabled}
              onChange={() => void saveOffer(value)}
              className="accent-accent"
            />
            {t(key)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
