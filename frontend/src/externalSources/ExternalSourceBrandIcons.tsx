import type { ReactNode } from "react";
import type { ExternalSourceId } from "./externalSourceIds";

/**
 * URLs for files in ``frontend/public/brands/`` (vite ``import.meta.env.BASE_URL`` handles ``base: "./"``).
 */
function brandAssetUrl(relativeUnderPublic: string): string {
  const path = relativeUnderPublic.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${path}`;
}

const TILE =
  "shrink-0 rounded-xl border border-black/[0.06] dark:border-white/10 bg-white shadow-sm flex items-center justify-center overflow-hidden";

const TILE_MD = `${TILE} h-10 w-10`;
const TILE_SM = `${TILE} h-9 w-9`;

function BrandLogoImg({ src, className }: { src: string; className?: string }) {
  return (
    <img
      src={brandAssetUrl(src)}
      alt=""
      width={40}
      height={40}
      decoding="async"
      draggable={false}
      className={`max-h-full max-w-full object-contain select-none ${className ?? ""}`}
    />
  );
}

/** Gmail mark (workspace and other Gmail-specific surfaces). */
export function GmailBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/gmail.svg" className={compact ? "p-1" : "p-1.5"} />
    </div>
  );
}

/** Google Drive mark (workspace Drive block). */
export function GoogleDriveBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/google-drive.svg" className={compact ? "p-1" : "p-1.5"} />
    </div>
  );
}

/** Google Calendar mark (distinct from generic Google / Gmail / Drive tiles). */
export function GoogleCalendarBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/google-calendar.png" className={compact ? "p-0.5" : "p-1"} />
    </div>
  );
}

/** Dropbox mark (workspace Dropbox block and settings card). */
export function DropboxBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/dropbox.png" className={compact ? "p-1" : "p-1.5"} />
    </div>
  );
}

/** OneDrive mark (official asset under ``public/brands/``). */
export function OneDriveBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/onedrive.png" className={compact ? "p-1" : "p-1.5"} />
    </div>
  );
}

/** Outlook mark (SVG asset under ``public/brands/``). */
export function OutlookBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/outlook.png" className={compact ? "p-0.5" : "p-1"} />
    </div>
  );
}

/** Notion brand icon. */
function NotionBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/notion.png" className={compact ? "p-0.5" : "p-1"} />
    </div>
  );
}

/** Amazon S3 brand icon. */
export function S3BrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/s3.svg" className={compact ? "p-0.5" : "p-1"} />
    </div>
  );
}

/** Slack brand icon. */
export function SlackBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/slack.png" className={compact ? "p-0.5" : "p-1"} />
    </div>
  );
}

/** WhatsApp brand icon. */
export function WhatsAppBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/whatsapp.png" className={compact ? "p-0.5" : "p-1"} />
    </div>
  );
}

/** iCloud Drive brand icon. */
export function ICloudBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/icloud.svg" className={compact ? "p-0.5" : "p-1"} />
    </div>
  );
}

/** Infomaniak kDrive brand icon (official-style stacked folders asset). */
export function InfomaniakBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/kdrive.png" className={compact ? "p-1" : "p-1.5"} />
    </div>
  );
}

/** Infomaniak Mail workspace row — same mark as kDrive; labels distinguish sources. */
export function InfomaniakMailBrandIcon({ compact = false }: { compact?: boolean }) {
  return <InfomaniakBrandIcon compact={compact} />;
}

/** Infomaniak Calendar brand icon (distinct from kDrive in External sources and assistant UI). */
function InfomaniakCalendarBrandIcon({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? TILE_SM : TILE_MD} aria-hidden>
      <BrandLogoImg src="brands/infomaniak-calendar.png" className={compact ? "p-0.5" : "p-1"} />
    </div>
  );
}

const BRAND_ICONS: Record<ExternalSourceId, ReactNode> = {
  gmail: <GmailBrandIcon compact={false} />,
  "google-drive": <GoogleDriveBrandIcon compact={false} />,
  "google-calendar": <GoogleCalendarBrandIcon compact={false} />,
  dropbox: <DropboxBrandIcon compact={false} />,
  onedrive: <OneDriveBrandIcon compact={false} />,
  outlook: <OutlookBrandIcon compact={false} />,
  notion: <NotionBrandIcon compact={false} />,
  s3: <S3BrandIcon compact={false} />,
  slack: <SlackBrandIcon compact={false} />,
  whatsapp: <WhatsAppBrandIcon compact={false} />,
  icloud: <ICloudBrandIcon compact={false} />,
  infomaniak: <InfomaniakBrandIcon compact={false} />,
  "infomaniak-mail": <InfomaniakMailBrandIcon compact={false} />,
  "infomaniak-calendar": <InfomaniakCalendarBrandIcon compact={false} />,
};

export function externalSourceBrandIcon(id: ExternalSourceId): ReactNode {
  return BRAND_ICONS[id];
}
