import { APP_DISPLAY_NAME, EXO_APP_ICON_URL } from "../constants";

type ExoAppIconProps = {
  /** Decorative when a visible name sits beside the tile. */
  decorative?: boolean;
};

const TILE =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-white " +
  "rounded-[22%] shadow-[0_1px_2px_rgba(15,23,42,0.14)] ring-1 ring-black/10";

/** Home-screen app tile: white squircle, cube inset with padding. */
export default function ExoAppIcon({ decorative = false }: ExoAppIconProps) {
  return (
    <span className={TILE} data-exo-app-icon>
      <img
        src={EXO_APP_ICON_URL}
        alt={decorative ? "" : APP_DISPLAY_NAME}
        width={24}
        height={24}
        draggable={false}
        className="h-[58%] w-[58%] object-contain pointer-events-none select-none"
      />
    </span>
  );
}
