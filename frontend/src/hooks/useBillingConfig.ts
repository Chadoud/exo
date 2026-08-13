import { useEffect, useState } from "react";

interface BillingConfig {
  loading: boolean;
  /** Whether Stripe billing is live on the cloud API. */
  enabled: boolean;
  /** Display-only price strings (e.g. "CHF 9"); charging uses server-side price IDs. */
  priceMonthly: string | null;
  priceAnnual: string | null;
}

const UNAVAILABLE: BillingConfig = {
  loading: false,
  enabled: false,
  priceMonthly: null,
  priceAnnual: null,
};

/** Public billing config from the cloud API (via Electron main; cached there). */
export function useBillingConfig(): BillingConfig {
  const [config, setConfig] = useState<BillingConfig>({ ...UNAVAILABLE, loading: true });

  useEffect(() => {
    const bridge = window.electronAPI?.billingGetConfig;
    if (!bridge) {
      setConfig(UNAVAILABLE);
      return;
    }
    let cancelled = false;
    void bridge()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setConfig(UNAVAILABLE);
          return;
        }
        setConfig({
          loading: false,
          enabled: Boolean(res.enabled),
          priceMonthly: res.priceMonthly ?? null,
          priceAnnual: res.priceAnnual ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setConfig(UNAVAILABLE);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
