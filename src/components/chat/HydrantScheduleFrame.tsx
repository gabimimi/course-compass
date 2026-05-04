"use client";

/**
 * Hydrant embed: viewport-only crop (cross-origin — we cannot change Hydrant’s DOM).
 *
 * Where clipping happens (see component below):
 * 1. **Horizontal** — `max-w-[620px]` + `overflow-hidden`: only the left ~620px of the
 *    1240px-wide iframe is visible (weekly grid column).
 * 2. **Vertical** — responsive wrapper height + `overflow-hidden` so phones aren’t stuck in a 950px box.
 * 3. **Top offset** — `top: -CROP_TOP_PX` shifts the iframe up so the Hydrant header is hidden
 *    outside the top edge of the clip (still “clipped” by the same overflow box).
 */

const HYDRANT_DESKTOP_W = 1240;
const CROP_TOP_PX = 180;
/** Iframe document height — must be large enough that FullCalendar isn’t clipped *inside* the iframe. */
const HYDRANT_CANVAS_H = 3000;

export function HydrantScheduleFrame({ url }: { url: string }) {
  return (
    <div
      className="relative mx-auto h-[min(560px,72dvh)] max-h-[min(900px,calc(100dvh-14rem))] w-full max-w-[min(620px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm sm:h-[950px] sm:max-h-none"
      style={{ overscrollBehavior: "none" }}
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
  );
}
