import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { clamp } from "@/lib/util";

/** Resizable editor chrome: side panels + timeline height. */
export interface PaneLayout {
  left: number;
  right: number;
  /** `null` keeps the timeline at its content height. */
  timeline: number | null;
}

export const LEFT_MIN = 220;
export const LEFT_MAX = 560;
export const RIGHT_MIN = 240;
export const RIGHT_MAX = 620;
export const TIMELINE_MIN = 150;

export const DEFAULT_PANE_LAYOUT: PaneLayout = { left: 300, right: 308, timeline: null };

const STORAGE_KEY = "clipmill/pane-layout/v1";

/** Keep the panes usable when the window shrinks: the preview must stay visible. */
function clampPane(p: PaneLayout): PaneLayout {
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  const leftMax = Math.max(LEFT_MIN, Math.min(LEFT_MAX, Math.round(vw * 0.42)));
  const rightMax = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, Math.round(vw * 0.44)));
  const tlMax = Math.max(TIMELINE_MIN, Math.round(vh * 0.62));
  return {
    left: Math.round(clamp(p.left, LEFT_MIN, leftMax)),
    right: Math.round(clamp(p.right, RIGHT_MIN, rightMax)),
    timeline: p.timeline == null ? null : Math.round(clamp(p.timeline, TIMELINE_MIN, tlMax)),
  };
}

export function usePaneLayout() {
  const [layout, setLayoutState] = useState<PaneLayout>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return clampPane({ ...DEFAULT_PANE_LAYOUT, ...(JSON.parse(raw) as Partial<PaneLayout>) });
    } catch {
      // Corrupt storage: fall back to defaults.
    }
    return clampPane(DEFAULT_PANE_LAYOUT);
  });

  const setLayout = useCallback((next: PaneLayout | ((cur: PaneLayout) => PaneLayout)) => {
    setLayoutState((cur) => {
      const value = clampPane(typeof next === "function" ? next(cur) : next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Storage may be full or disabled; resizing still works for this session.
      }
      return value;
    });
  }, []);

  // Re-fit when the window changes size (external monitor, browser resize).
  useEffect(() => {
    const onResize = () => setLayoutState((cur) => clampPane(cur));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const reset = useCallback(() => setLayout(DEFAULT_PANE_LAYOUT), [setLayout]);

  return { layout, setLayout, reset };
}

interface SplitterProps {
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onReset?: () => void;
  /** Right panel / bottom panel grow when the pointer moves towards the start. */
  invert?: boolean;
  title?: string;
  className?: string;
}

/**
 * Draggable divider between two editor regions. Pointer capture keeps the drag
 * alive outside the thin hit area; double click (or Enter) restores the default.
 */
export function Splitter({ orientation, value, min, max, onChange, onReset, invert, title, className }: SplitterProps) {
  const vertical = orientation === "vertical";
  const origin = useRef<{ pos: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const stopDrag = useCallback((el: HTMLElement, pointerId: number) => {
    if (!origin.current) return;
    origin.current = null;
    setDragging(false);
    document.body.classList.remove("select-none");
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  }, []);

  useEffect(() => () => document.body.classList.remove("select-none"), []);

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={title}
      tabIndex={0}
      title={title}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = { pos: vertical ? e.clientX : e.clientY, value };
        setDragging(true);
        document.body.classList.add("select-none");
      }}
      onPointerMove={(e) => {
        const o = origin.current;
        if (!o) return;
        const delta = (vertical ? e.clientX : e.clientY) - o.pos;
        changeRef.current(Math.round(clamp(o.value + (invert ? -delta : delta), min, max)));
      }}
      onPointerUp={(e) => stopDrag(e.currentTarget, e.pointerId)}
      onPointerCancel={(e) => stopDrag(e.currentTarget, e.pointerId)}
      onDoubleClick={() => onReset?.()}
      onKeyDown={(e) => {
        const back = vertical ? "ArrowLeft" : "ArrowUp";
        const fwd = vertical ? "ArrowRight" : "ArrowDown";
        if (e.key !== back && e.key !== fwd) return;
        e.preventDefault();
        const step = (e.shiftKey ? 40 : 12) * (e.key === fwd ? 1 : -1) * (invert ? -1 : 1);
        changeRef.current(Math.round(clamp(value + step, min, max)));
      }}
      className={clsx(
        "group relative z-30 shrink-0 touch-none outline-none select-none",
        vertical ? "-mx-[3px] w-[6px] cursor-col-resize" : "-my-[3px] h-[6px] w-full cursor-row-resize",
        className,
      )}
    >
      <span
        className={clsx(
          "absolute transition-colors",
          vertical ? "inset-y-0 left-1/2 w-px -translate-x-1/2" : "inset-x-0 top-1/2 h-px -translate-y-1/2",
          dragging ? "bg-safelight" : "bg-line group-hover:bg-safelight/70 group-focus-visible:bg-safelight",
        )}
      />
      <span
        className={clsx(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
          vertical ? "h-7 w-[3px]" : "h-[3px] w-7",
          dragging ? "bg-safelight" : "bg-transparent group-hover:bg-fog/70",
        )}
      />
    </div>
  );
}