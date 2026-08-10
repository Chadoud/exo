import type { EntitlementStatus } from "../api";
import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import { trialLineVars } from "../utils/entitlementUi";
import {
  accountAvatarInitials,
  accountDisplayLabel,
  accountFullName,
} from "../utils/accountProfileDisplay";

type SidebarProfileTabProps = {
  entitlement: EntitlementStatus | null;
  uiLocale: UiLocale;
  isActive: boolean;
  onOpenProfile: () => void;
};

function profileTitle(entitlement: EntitlementStatus | null, uiLocale: UiLocale): string {
  const label = accountDisplayLabel(entitlement);
  if (entitlement?.cloudLoggedIn && label) return label;
  return translate(uiLocale, "nav.profile");
}

function profileSubtitle(entitlement: EntitlementStatus | null, uiLocale: UiLocale): string {
  const email = entitlement?.cloudEmail?.trim();
  if (entitlement?.cloudLoggedIn && email && accountFullName(entitlement)) {
    return email;
  }
  if (entitlement?.cloudAuthRequired && entitlement.cloudLoggedIn !== true) {
    return translate(uiLocale, "nav.profileSignInHint");
  }
  if (entitlement?.unlimitedBuild) {
    return translate(uiLocale, "settings.unlimitedBuildTier");
  }
  if (entitlement?.licensed) {
    return translate(uiLocale, "settings.licenseFullTier");
  }
  if (entitlement?.subscriptionEntitled || entitlement?.subscriptionActive) {
    return translate(uiLocale, "billing.planPro");
  }
  if (entitlement?.trialActive && !entitlement.trialExpired) {
    return translate(uiLocale, "settings.trialMeterLine", trialLineVars(entitlement));
  }
  return translate(uiLocale, "settings.accountPlanFree");
}

/** Bottom-pinned account control — opens Settings → account & profile. */
export default function SidebarProfileTab({
  entitlement,
  uiLocale,
  isActive,
  onOpenProfile,
}: SidebarProfileTabProps) {
  const title = profileTitle(entitlement, uiLocale);
  const subtitle = profileSubtitle(entitlement, uiLocale);
  const loggedIn = entitlement?.cloudLoggedIn === true && Boolean(accountDisplayLabel(entitlement));

  return (
    <div className="shrink-0 border-t border-border p-2">
      <button
        type="button"
        data-tour="nav-profile"
        title={title}
        onClick={onOpenProfile}
        className={`sidebar-profile-btn flex w-full min-w-0 select-none flex-row items-center justify-start gap-2 rounded-xl px-3 py-2.5 text-left transition-all
          ${
            isActive
              ? "bg-button-primary text-white"
              : "text-muted hover:bg-hover-overlay hover:text-text-primary"
          }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold
            ${
              isActive
                ? "bg-white/20 text-white"
                : loggedIn
                  ? "bg-accent-muted text-accent"
                  : "bg-hover-overlay text-muted"
            }`}
          aria-hidden
        >
          {loggedIn ? (
            accountAvatarInitials(entitlement)
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
              />
            </svg>
          )}
        </span>
        <span className="sidebar-profile-detail min-w-0 flex-1">
          <span className="block truncate text-xs font-medium leading-tight">{title}</span>
          <span
            className={`block truncate text-[10px] leading-tight ${
              isActive ? "text-white/80" : "text-muted"
            }`}
          >
            {subtitle}
          </span>
        </span>
      </button>
    </div>
  );
}
