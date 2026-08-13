import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { APP_DISPLAY_NAME, APP_LOGO_URL, EXO_FORGOT_PASSWORD_WEB_URL } from "../constants";
import { useRememberDevicePreference } from "../hooks/useRememberDevicePreference";
import {
  performCloudAuth,
  performSocialLogin,
  toastCloudAuthResult,
  toastSocialAuthFailure,
} from "../utils/cloudAuthActions";
import { trackAccountSignedIn } from "../telemetry/lifecycle";
import { useI18n } from "../i18n/I18nContext";
import { Spinner } from "./Spinner";
import { ELEVATED_CARD_CLASS } from "../utils/styles";
import SocialSignInButton, { SOCIAL_SIGN_IN_LABEL_KEYS } from "./auth/SocialSignInButton";
import {
  SOCIAL_SIGN_IN_BROWSER_HINT_KEYS,
  SOCIAL_SIGN_IN_PROVIDERS,
  type SocialProvider,
} from "./auth/socialSignIn";
import SegmentedTabBar from "./ui/SegmentedTabBar";
import PasswordField from "./ui/PasswordField";

interface CloudAuthScreenProps {
  onSignedIn: () => void;
}

type EmailMode = "register" | "login";

/**
 * First-run account gate — email sign-in first, Google/Apple below.
 */
export default function CloudAuthScreen({ onSignedIn }: CloudAuthScreenProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingSocialProvider, setPendingSocialProvider] = useState<SocialProvider | null>(null);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providers, setProviders] = useState({ google: false, apple: false, password: true });
  const [emailMode, setEmailMode] = useState<EmailMode>("login");
  const { rememberDevice, setRememberDevice } = useRememberDevicePreference();

  useEffect(() => {
    let active = true;

    async function loadProviders() {
      try {
        const fn = window.electronAPI?.cloudAuthGetProviders;
        if (!fn) {
          return;
        }
        const p = await fn();
        if (!active || !p) return;
        setProviders({
          google: Boolean(p.google),
          apple: Boolean(p.apple),
          password: p.password !== false,
        });
      } catch {
        /* IPC/network failure — keep password path; hide misleading social hint */
      } finally {
        if (active) setProvidersLoading(false);
      }
    }

    void loadProviders();
    return () => {
      active = false;
    };
  }, []);

  const runEmail = async (mode: EmailMode) => {
    setBusy(true);
    try {
      const result = await performCloudAuth(
        mode,
        email,
        password,
        mode === "register"
          ? { firstName, lastName, confirmPassword }
          : undefined,
      );
      if (toastCloudAuthResult(t, mode, result)) {
        trackAccountSignedIn();
        setPassword("");
        setConfirmPassword("");
        onSignedIn();
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelSocialLogin = useCallback(() => {
    void window.electronAPI?.cloudAuthCancelSocial?.();
    setPendingSocialProvider(null);
    setBusy(false);
  }, []);

  const runSocial = async (provider: SocialProvider) => {
    setBusy(true);
    setPendingSocialProvider(provider);
    try {
      const result = await performSocialLogin(provider);
      if (result.ok) {
        trackAccountSignedIn();
        toast.success(t("cloudAuth.socialSuccess"));
        onSignedIn();
      } else if (result.reason === "cancelled") {
        toast.message(t("cloudAuth.socialCancelled"));
      } else if (result.reason !== "desktop_only") {
        toastSocialAuthFailure(t, result.message);
      }
    } finally {
      setPendingSocialProvider(null);
      setBusy(false);
    }
  };

  const openForgotPassword = () => {
    void window.electronAPI?.openExternal?.(EXO_FORGOT_PASSWORD_WEB_URL);
  };

  const hasSocial = providers.google || providers.apple;

  const emailModeTabs = useMemo(
    () => [
      { id: "register" as const, label: t("cloudAuth.createAccountTab") },
      { id: "login" as const, label: t("cloudAuth.signInTab") },
    ],
    [t],
  );

  const socialBrowserHint =
    pendingSocialProvider != null
      ? t(SOCIAL_SIGN_IN_BROWSER_HINT_KEYS[pendingSocialProvider])
      : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-auth-heading"
      className="w-full max-w-md px-6 py-10 space-y-6"
    >
      <div className="text-center space-y-3">
        <img src={APP_LOGO_URL} alt="" className="w-16 h-16 mx-auto object-contain" />
        <h1 id="cloud-auth-heading" className="text-2xl font-semibold text-text-primary tracking-tight">
          {t("cloudAuth.screenTitle", { app: APP_DISPLAY_NAME })}
        </h1>
        <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">{t("cloudAuth.screenSubtitle")}</p>
      </div>

      {pendingSocialProvider && (
        <div
          className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary"
          role="status"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <Spinner className="w-5 h-5 text-accent" />
            <p>{socialBrowserHint}</p>
            <button
              type="button"
              onClick={cancelSocialLogin}
              className="text-xs font-medium text-accent hover:underline"
            >
              {t("cloudAuth.socialCancel")}
            </button>
          </div>
        </div>
      )}

      <div className={ELEVATED_CARD_CLASS}>
        {providersLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
            <Spinner className="w-5 h-5" />
            {t("cloudAuth.loadingProviders")}
          </div>
        ) : (
          <>
            {providers.password && (
              <>
                {!hasSocial && !providersLoading && (
                  <p className="text-xs text-muted leading-relaxed rounded-lg border border-border/80 bg-bg-secondary/60 px-3 py-2.5">
                    {t("cloudAuth.emailOnlyHint")}
                  </p>
                )}

                <SegmentedTabBar
                  tabs={emailModeTabs}
                  activeId={emailMode}
                  onSelect={setEmailMode}
                  disabled={busy}
                  ariaLabel={t("cloudAuth.emailModeTabsAria")}
                />

                <div className="space-y-2">
                  {emailMode === "register" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <label htmlFor="cloud-auth-first-name" className="text-xs font-medium text-text-primary">
                          {t("settings.accountFirstName")}
                        </label>
                        <input
                          id="cloud-auth-first-name"
                          type="text"
                          autoComplete="given-name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          disabled={busy}
                          className="w-full rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-text-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="cloud-auth-last-name" className="text-xs font-medium text-text-primary">
                          {t("settings.accountLastName")}
                        </label>
                        <input
                          id="cloud-auth-last-name"
                          type="text"
                          autoComplete="family-name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          disabled={busy}
                          className="w-full rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-text-primary"
                        />
                      </div>
                    </div>
                  ) : null}

                  <label htmlFor="cloud-auth-email" className="text-xs font-medium text-text-primary">
                    {t("settings.accountEmail")}
                  </label>
                  <input
                    id="cloud-auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-text-primary"
                  />

                  <PasswordField
                    id="cloud-auth-password"
                    label={t("settings.accountPassword")}
                    value={password}
                    onChange={setPassword}
                    autoComplete={emailMode === "register" ? "new-password" : "current-password"}
                    disabled={busy}
                    hint={emailMode === "register" ? t("settings.accountPasswordHint") : undefined}
                  />

                  {emailMode === "register" ? (
                    <PasswordField
                      id="cloud-auth-confirm-password"
                      label={t("settings.accountConfirmPassword")}
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      autoComplete="new-password"
                      disabled={busy}
                    />
                  ) : null}
                </div>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border-border mt-0.5 shrink-0"
                    checked={rememberDevice}
                    disabled={busy}
                    onChange={(e) => void setRememberDevice(e.target.checked)}
                  />
                  <span className="text-sm text-text-primary leading-snug">{t("settings.accountStaySignedIn")}</span>
                </label>

                <button
                  type="button"
                  onClick={() => void runEmail(emailMode)}
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 min-h-[2.75rem] px-4 py-2.5 rounded-xl text-sm font-semibold bg-button-primary text-white hover:bg-button-hover disabled:opacity-40"
                >
                  {busy && !pendingSocialProvider ? (
                    <Spinner className="w-5 h-5 text-white" />
                  ) : emailMode === "register" ? (
                    t("cloudAuth.createAccountCta")
                  ) : (
                    t("cloudAuth.signInCta")
                  )}
                </button>

                {emailMode === "login" ? (
                  <button
                    type="button"
                    onClick={openForgotPassword}
                    disabled={busy}
                    className="w-full text-center text-sm text-accent hover:underline disabled:opacity-40"
                    aria-label={t("cloudAuth.forgotPasswordAria")}
                  >
                    {t("cloudAuth.forgotPassword")}
                  </button>
                ) : null}
              </>
            )}

            {hasSocial && providers.password && (
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-2xs uppercase tracking-wide text-muted">{t("cloudAuth.orDivider")}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            )}

            {hasSocial && (
              <div className="space-y-2">
                {SOCIAL_SIGN_IN_PROVIDERS.filter((provider) => providers[provider]).map((provider) => (
                  <SocialSignInButton
                    key={provider}
                    provider={provider}
                    label={t(SOCIAL_SIGN_IN_LABEL_KEYS[provider])}
                    busy={busy}
                    pending={pendingSocialProvider === provider}
                    onClick={() => void runSocial(provider)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
