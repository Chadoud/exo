import { useState } from "react";
import { toast } from "sonner";
import type { EntitlementStatus } from "../../api";
import { useRememberDevicePreference } from "../../hooks/useRememberDevicePreference";
import { performCloudAuth, performCloudLogout, toastCloudAuthResult } from "../../utils/cloudAuthActions";
import { trackAccountDeleted, trackAccountSignedIn, trackAccountSignedOut } from "../../telemetry/lifecycle";
import { useI18n } from "../../i18n/I18nContext";
import PasswordField from "../ui/PasswordField";
import {
  accountAvatarInitials,
  accountFullName,
} from "../../utils/accountProfileDisplay";

interface SettingsAccountSectionProps {
  entitlement: EntitlementStatus | null;
  onSessionChange: () => void;
  telemetryOptIn?: boolean;
  uiLocale?: string;
}

export default function SettingsAccountSection({
  entitlement,
  onSessionChange,
  telemetryOptIn,
  uiLocale,
}: SettingsAccountSectionProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { rememberDevice, setRememberDevice } = useRememberDevicePreference();

  if (!entitlement || !entitlement.cloudAuthRequired) {
    return null;
  }

  const loggedIn = entitlement.cloudLoggedIn === true;
  const displayEmail = entitlement.cloudEmail ?? "";
  const fullName = accountFullName(entitlement);
  const licensed = entitlement.licensed ?? false;
  const subscribed = Boolean(entitlement.subscriptionEntitled || entitlement.subscriptionActive);
  const initials = accountAvatarInitials(entitlement);

  const run = async (mode: "register" | "login") => {
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
        trackAccountSignedIn(telemetryOptIn, uiLocale);
        setPassword("");
        setConfirmPassword("");
        onSessionChange();
      }
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      const ok = await performCloudLogout();
      if (ok) {
        trackAccountSignedOut(telemetryOptIn, uiLocale);
        toast.message(t("settings.accountSignedOut"), {
          description: t("settings.accountLocalVaultHint"),
        });
        onSessionChange();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!loggedIn) {
    return (
      <div id="account-profile" className="space-y-3 scroll-mt-28 mb-4">
        <div className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-text-primary">{t("settings.accountProfileTitle")}</p>
            <p className="text-xs text-muted mt-1">{t("settings.accountProfileDesc")}</p>
            <p className="text-2xs text-muted mt-1.5 leading-relaxed">{t("settings.accountLocalVaultHint")}</p>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-2">
                <label htmlFor="settings-account-first-name" className="text-xs font-medium text-text-primary">
                  {t("settings.accountFirstName")}
                </label>
                <input
                  id="settings-account-first-name"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-primary"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="settings-account-last-name" className="text-xs font-medium text-text-primary">
                  {t("settings.accountLastName")}
                </label>
                <input
                  id="settings-account-last-name"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-primary"
                />
              </div>
            </div>
            <label htmlFor="settings-account-email" className="text-xs font-medium text-text-primary">
              {t("settings.accountEmail")}
            </label>
            <input
              id="settings-account-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-primary"
            />
            <PasswordField
              id="settings-account-password"
              label={t("settings.accountPassword")}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              disabled={busy}
              hint={t("settings.accountPasswordHint")}
            />
            <PasswordField
              id="settings-account-confirm-password"
              label={t("settings.accountConfirmPassword")}
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              disabled={busy}
            />
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run("register")}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-button-primary text-white hover:bg-button-hover disabled:opacity-40"
            >
              {busy ? t("settings.accountSwitching") : t("settings.accountRegister")}
            </button>
            <button
              type="button"
              onClick={() => void run("login")}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-primary hover:border-accent-line disabled:opacity-40"
            >
              {busy ? t("settings.accountSwitching") : t("settings.accountLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="account-profile" className="space-y-4 scroll-mt-28 mb-4">
      <div className="rounded-xl border border-border bg-bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="w-12 h-12 rounded-full bg-accent-muted text-accent flex items-center justify-center text-sm font-semibold shrink-0"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-base font-semibold text-text-primary tracking-tight">
              {fullName || t("settings.accountProfileTitle")}
            </p>
            {displayEmail ? (
              <p className="text-xs text-muted break-all">{displayEmail}</p>
            ) : null}
            {licensed || subscribed ? (
              <span className="inline-block text-3xs font-semibold uppercase tracking-wide text-success px-2 py-0.5 rounded-md bg-success-soft border border-success-line">
                {licensed ? t("settings.licenseFullTier") : t("billing.planPro")}
              </span>
            ) : (
              <span className="inline-block text-3xs font-semibold uppercase tracking-wide text-muted px-2 py-0.5 rounded-md bg-hover-overlay border border-border">
                {t("settings.accountPlanFree")}
              </span>
            )}
            <p className="text-2xs text-muted pt-1 leading-relaxed">{t("settings.accountLocalVaultHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted hover:text-text-primary disabled:opacity-40 shrink-0"
          >
            {busy ? t("settings.accountSwitching") : t("settings.accountSignOut")}
          </button>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            className="rounded border-border mt-0.5 shrink-0"
            checked={rememberDevice}
            disabled={busy}
            onChange={(e) => void setRememberDevice(e.target.checked)}
          />
          <span className="text-sm text-text-primary leading-snug">{t("settings.accountStaySignedIn")}</span>
        </label>

        <CloudDataRightsControls
          busy={busy}
          onSessionChange={onSessionChange}
          setBusy={setBusy}
          telemetryOptIn={telemetryOptIn}
          uiLocale={uiLocale}
        />
      </div>
    </div>
  );
}

function CloudDataRightsControls({
  busy,
  setBusy,
  onSessionChange,
  telemetryOptIn,
  uiLocale,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  onSessionChange: () => void;
  telemetryOptIn?: boolean;
  uiLocale?: string;
}) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportAccountData = async () => {
    const api = window.electronAPI;
    if (!api?.cloudAuthExportData) {
      toast.error(t("settings.accountExportUnavailable"));
      return;
    }
    setBusy(true);
    try {
      const result = await api.cloudAuthExportData();
      if (!result?.ok || result.data === undefined) {
        toast.error(result?.error || t("settings.accountExportError"));
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `exo-account-export-${stamp}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.message(t("settings.accountExportDone"));
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const api = window.electronAPI;
    if (!api?.cloudAuthDeleteAccount) {
      toast.error(t("settings.accountDeleteUnavailable"));
      return;
    }
    setBusy(true);
    try {
      trackAccountDeleted(telemetryOptIn, uiLocale);
      const result = await api.cloudAuthDeleteAccount();
      if (result?.ok) {
        toast.message(t("settings.accountDeleteDone"));
        setConfirmDelete(false);
        onSessionChange();
      } else {
        toast.error(result?.error || t("settings.accountDeleteError"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border-soft">
      <p className="text-xs font-medium text-text-primary">{t("settings.accountDataRightsTitle")}</p>
      <p className="text-2xs text-muted leading-relaxed">{t("settings.accountDataRightsHint")}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportAccountData()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-primary hover:border-accent-line disabled:opacity-40"
        >
          {t("settings.accountExportData")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void deleteAccount()}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${
            confirmDelete
              ? "bg-red-600 text-white hover:bg-red-500"
              : "border border-red-500/40 text-red-400 hover:bg-red-500/10"
          }`}
        >
          {confirmDelete ? t("settings.accountDeleteConfirm") : t("settings.accountDelete")}
        </button>
        {confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-text-primary"
          >
            {t("memories.cancel")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
