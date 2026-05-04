"use client";

/**
 * Hydrant embed (cross-origin — we cannot change Hydrant’s DOM).
 *
 * The iframe is 1240px wide (Hydrant’s weekly layout). The outer shell is
 * `overflow-x-auto` so you can scroll horizontally to see Fri / nav arrows; the
 * inner clip uses a fixed width (1240) + `overflow-hidden` for height and the
 * top offset (header crop). **Vertical** — responsive wrapper height + `overflow-hidden`
 * so small screens don’t get a 950px-tall box.
 */

const HYDRANT_DESKTOP_W = 1240;
const CROP_TOP_PX = 130;
/** Iframe document height — must be large enough that FullCalendar isn’t clipped *inside* the iframe. */
const HYDRANT_CANVAS_H = 3000;

export function HydrantScheduleFrame({ url }: { url: string }) {
  return (
    <div
      className="w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm [scrollbar-gutter:stable]"
      style={{ overscrollBehaviorX: "contain", overscrollBehaviorY: "none" }}
    >
      <div
        className="relative mx-auto h-[min(560px,72dvh)] max-h-[min(900px,calc(100dvh-14rem))] w-[600px] shrink-0 overflow-hidden sm:h-[950px] sm:max-h-none"
      >
        <iframe
          key={url}
          src={url}
          title="Weekly schedule"
          className="absolute left-0 border-0 bg-white"
          width={HYDRANT_DESKTOP_W}
          height={HYDRANT_CANVAS_H}
          style={{
            top: -CROP_TOP_PX,
            left: 0,
            maxWidth: "none",
          }}
          {...{ scrolling: "no" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
