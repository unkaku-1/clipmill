import type { AssetMeta, Clip, Group, ID, Project, Transition } from "@/types/project";
import { clamp } from "@/lib/util";

export type SegmentKind = "intro" | "title" | "clip" | "outro";

/**
 * Duration sanitation.
 *
 * Segment durations come from project style fields and media metadata, both of
 * which can be corrupt: a video container without duration metadata reports
 * `Infinity`/`NaN`, and a project/preset written by an older or broken build can
 * store any number. `layout.duration` is consumed by the timeline ruler, the
 * preview clock and the exporter; a non-finite span makes the ruler tick loop
 * spin forever and locks the whole page. Every duration is therefore clamped
 * into a finite range *before* it can reach a segment.
 */
const MIN_SEGMENT = 0.2;
/** Brand intro/outro/title: templates are seconds of animation, never hours. */
const MAX_BRAND_DURATION = 60;
/** Clips may legitimately be long (a 2h video), but never absurd. */
const MAX_CLIP_DURATION = 7200;
/** Transitions are short cross-fades. */
const MAX_TRANSITION = 2;

const finiteNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** Clamp an arbitrary duration into [min, max]; invalid/0 falls back. */
function clampDuration(value: unknown, min: number, max: number, fallback: number): number {
  const n = finiteNumber(value);
  if (!Number.isFinite(n) || n <= 0) {
    const fb = finiteNumber(fallback);
    return clamp(Number.isFinite(fb) ? fb : min, min, max);
  }
  return clamp(n, min, max);
}

/** Clamp a transition length into [0, MAX_TRANSITION]. */
function clampTransition(value: unknown): number {
  const n = finiteNumber(value);
  return Number.isFinite(n) ? clamp(n, 0, MAX_TRANSITION) : 0;
}

export interface Segment {
  /** "intro" | "title" | "outro" | clip id */
  key: string;
  kind: SegmentKind;
  start: number;
  end: number;
  /** Effective (clamped) transition from the previous segment, or null. */
  transIn: Transition | null;
  /** Visual cut points: middle of the in/out transitions. */
  cutIn: number;
  cutOut: number;
  clip?: Clip;
  group?: Group;
  groupIndex: number;
  clipIndex: number;
  /** Index among all clips of the sequence (for deterministic "auto" motion). */
  seqIndex: number;
  /** Asset rendered by this segment (clip media or intro/outro video). */
  assetId: ID | null;
}

export interface CaptionRun {
  group: Group;
  start: number;
  end: number;
}

export interface Layout {
  segments: Segment[];
  byKey: Map<string, Segment>;
  clips: Segment[];
  duration: number;
  intro: Segment | null;
  title: Segment | null;
  outro: Segment | null;
  logoStart: number;
  logoEnd: number;
  captionRuns: CaptionRun[];
  /** First clip asset, used by "blur-first" title backgrounds. */
  firstAssetId: ID | null;
}

interface Pending {
  key: string;
  kind: SegmentKind;
  dur: number;
  transIn: Transition | null;
  clip?: Clip;
  group?: Group;
  groupIndex: number;
  clipIndex: number;
  seqIndex: number;
  assetId: ID | null;
}

export function computeLayout(project: Project, assets: Record<ID, AssetMeta>): Layout {
  const { style } = project;
  const brand = style.brand;
  const items: Pending[] = [];

  // Intro
  if (brand.intro.mode === "template") {
    items.push(seg("intro", "intro", clampDuration(brand.intro.duration, MIN_SEGMENT, MAX_BRAND_DURATION, 3.5), null));
  } else if (brand.intro.mode === "video" && brand.intro.videoAssetId && assets[brand.intro.videoAssetId]) {
    const a = assets[brand.intro.videoAssetId];
    const fallback = clampDuration(brand.intro.duration, MIN_SEGMENT, MAX_BRAND_DURATION, 3.5);
    items.push({
      ...seg("intro", "intro", clampDuration(a.duration, MIN_SEGMENT, MAX_CLIP_DURATION, fallback), null),
      assetId: a.id,
    });
  }

  // Theme title
  if (style.title.enabled) {
    items.push(seg("title", "title", clampDuration(style.title.duration, MIN_SEGMENT, MAX_BRAND_DURATION, 3.2), style.sequence.titleTransition));
  }

  // Clips grouped by theme
  let seqIndex = 0;
  project.groups.forEach((group, gi) => {
    group.clips.forEach((clip, ci) => {
      const asset = assets[clip.assetId];
      if (!asset) return;
      items.push({
        key: clip.id,
        kind: "clip",
        dur: clampDuration(clip.duration, MIN_SEGMENT, MAX_CLIP_DURATION, MIN_SEGMENT),
        transIn: clip.transition,
        clip,
        group,
        groupIndex: gi,
        clipIndex: ci,
        seqIndex: seqIndex++,
        assetId: asset.id,
      });
    });
  });

  // Outro
  if (brand.outro.mode === "template") {
    items.push(seg("outro", "outro", clampDuration(brand.outro.duration, MIN_SEGMENT, MAX_BRAND_DURATION, 4), style.sequence.outroTransition));
  } else if (brand.outro.mode === "video" && brand.outro.videoAssetId && assets[brand.outro.videoAssetId]) {
    const a = assets[brand.outro.videoAssetId];
    const fallback = clampDuration(brand.outro.duration, MIN_SEGMENT, MAX_BRAND_DURATION, 4);
    items.push({
      ...seg("outro", "outro", clampDuration(a.duration, MIN_SEGMENT, MAX_CLIP_DURATION, fallback), style.sequence.outroTransition),
      assetId: a.id,
    });
  }

  const segments: Segment[] = [];
  let prev: Segment | null = null;
  for (const it of items) {
    let transIn: Transition | null = null;
    let overlap = 0;
    if (prev && it.transIn && it.transIn.type !== "cut") {
      const prevDur = prev.end - prev.start;
      // A corrupt transition duration must not poison start/end with NaN.
      const want = clampTransition(it.transIn.duration);
      overlap = Math.max(0, Math.min(want, 0.45 * Math.min(prevDur, it.dur)));
      if (overlap > 0.01) transIn = { type: it.transIn.type, duration: overlap };
      else overlap = 0;
    }
    const start: number = prev ? prev.end - overlap : 0;
    const s: Segment = {
      key: it.key,
      kind: it.kind,
      start,
      end: start + it.dur,
      transIn,
      cutIn: start + overlap / 2,
      cutOut: start + it.dur,
      clip: it.clip,
      group: it.group,
      groupIndex: it.groupIndex,
      clipIndex: it.clipIndex,
      seqIndex: it.seqIndex,
      assetId: it.assetId,
    };
    if (prev) prev.cutOut = s.cutIn;
    segments.push(s);
    prev = s;
  }

  // Final safety net: a layout handed to the timeline ruler / clock / exporter
  // must never contain a non-finite edge (this is cheap and stays on in prod).
  let cursor = 0;
  for (const s of segments) {
    if (!Number.isFinite(s.start) || s.start < 0) s.start = cursor;
    if (!Number.isFinite(s.end) || s.end < s.start) s.end = s.start + MIN_SEGMENT;
    if (!Number.isFinite(s.cutIn) || s.cutIn < s.start) s.cutIn = s.start;
    if (!Number.isFinite(s.cutOut) || s.cutOut > s.end) s.cutOut = s.end;
    cursor = s.end;
  }

  const rawDuration = segments.length ? segments[segments.length - 1].end : 0;
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
  const byKey = new Map(segments.map((s) => [s.key, s]));
  const intro = byKey.get("intro") ?? null;
  const title = byKey.get("title") ?? null;
  const outro = byKey.get("outro") ?? null;
  const clips = segments.filter((s) => s.kind === "clip");

  // Caption runs: one per contiguous group of clips.
  const captionRuns: CaptionRun[] = [];
  if (style.caption.enabled) {
    let run: { group: Group; first: Segment; last: Segment } | null = null;
    const flush = () => {
      if (run && run.group.showCaption && run.group.name.trim()) {
        captionRuns.push({ group: run.group, start: run.first.cutIn, end: run.last.cutOut });
      }
    };
    for (const c of clips) {
      if (run && run.group.id === c.group!.id) {
        run.last = c;
      } else {
        flush();
        run = { group: c.group!, first: c, last: c };
      }
    }
    flush();
  }

  return {
    segments,
    byKey,
    clips,
    duration,
    intro,
    title,
    outro,
    logoStart: intro ? intro.end : 0,
    logoEnd: outro ? outro.start : duration,
    captionRuns,
    firstAssetId: clips[0]?.assetId ?? null,
  };

  function seg(key: string, kind: SegmentKind, dur: number, transIn: Transition | null): Pending {
    const safe = clampDuration(dur, MIN_SEGMENT, MAX_CLIP_DURATION, MIN_SEGMENT);
    return { key, kind, dur: safe, transIn, groupIndex: -1, clipIndex: -1, seqIndex: -1, assetId: null };
  }
}

/** Return the (at most two) segments visible at time t. */
export function activeSegments(layout: Layout, t: number): { a: Segment | null; b: Segment | null; p: number } {
  const segs = layout.segments;
  if (!segs.length) return { a: null, b: null, p: 0 };
  // A NaN/Infinity playhead must not break the binary search (nor produce NaN).
  const time = Number.isFinite(t) ? t : 0;
  // Binary search for the last segment with start <= t.
  let lo = 0;
  let hi = segs.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= time) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 0) return { a: segs[0], b: null, p: 0 };
  const cur = segs[idx];
  const prev = idx > 0 ? segs[idx - 1] : null;
  if (prev && cur.transIn && time < prev.end) {
    const p = (time - cur.start) / Math.max(1e-6, prev.end - cur.start);
    return { a: prev, b: cur, p: Number.isFinite(p) ? clamp(p, 0, 1) : 0 };
  }
  if (time >= cur.end && idx === segs.length - 1) return { a: cur, b: null, p: 0 };
  return { a: cur, b: null, p: 0 };
}

/** Find the segment whose visual cut range contains t. */
export function segmentAt(layout: Layout, t: number): Segment | null {
  const time = Number.isFinite(t) ? t : 0;
  for (const s of layout.segments) if (time >= s.cutIn && time < s.cutOut) return s;
  return layout.segments[layout.segments.length - 1] ?? null;
}

/** Sum the length that image clips must have to make the video match `target` seconds. */
export function solveImageDuration(
  project: Project,
  assets: Record<ID, AssetMeta>,
  target: number,
): number | null {
  const layout = computeLayout(project, assets);
  if (!Number.isFinite(target)) return null;
  const images = layout.clips.filter((s) => assets[s.assetId!]?.kind === "image");
  if (!images.length) return null;
  const currentImageSum = images.reduce((acc, s) => acc + (s.end - s.start), 0);
  const delta = target - layout.duration;
  const per = (currentImageSum + delta) / images.length;
  return Number.isFinite(per) ? per : null;
}
