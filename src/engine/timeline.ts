import type { AssetMeta, Clip, Group, ID, Project, Transition } from "@/types/project";

export type SegmentKind = "intro" | "title" | "clip" | "outro";

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
    items.push(seg("intro", "intro", brand.intro.duration, null));
  } else if (brand.intro.mode === "video" && brand.intro.videoAssetId && assets[brand.intro.videoAssetId]) {
    const a = assets[brand.intro.videoAssetId];
    items.push({ ...seg("intro", "intro", a.duration || brand.intro.duration, null), assetId: a.id });
  }

  // Theme title
  if (style.title.enabled) {
    items.push(seg("title", "title", style.title.duration, style.sequence.titleTransition));
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
        dur: Math.max(0.2, clip.duration),
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
    items.push(seg("outro", "outro", brand.outro.duration, style.sequence.outroTransition));
  } else if (brand.outro.mode === "video" && brand.outro.videoAssetId && assets[brand.outro.videoAssetId]) {
    const a = assets[brand.outro.videoAssetId];
    items.push({
      ...seg("outro", "outro", a.duration || brand.outro.duration, style.sequence.outroTransition),
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
      overlap = Math.max(0, Math.min(it.transIn.duration, 0.45 * Math.min(prevDur, it.dur)));
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

  const duration = segments.length ? segments[segments.length - 1].end : 0;
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
    return { key, kind, dur: Math.max(0.2, dur), transIn, groupIndex: -1, clipIndex: -1, seqIndex: -1, assetId: null };
  }
}

/** Return the (at most two) segments visible at time t. */
export function activeSegments(layout: Layout, t: number): { a: Segment | null; b: Segment | null; p: number } {
  const segs = layout.segments;
  if (!segs.length) return { a: null, b: null, p: 0 };
  // Binary search for the last segment with start <= t.
  let lo = 0;
  let hi = segs.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 0) return { a: segs[0], b: null, p: 0 };
  const cur = segs[idx];
  const prev = idx > 0 ? segs[idx - 1] : null;
  if (prev && cur.transIn && t < prev.end) {
    const p = (t - cur.start) / Math.max(1e-6, prev.end - cur.start);
    return { a: prev, b: cur, p };
  }
  if (t >= cur.end && idx === segs.length - 1) return { a: cur, b: null, p: 0 };
  return { a: cur, b: null, p: 0 };
}

/** Find the segment whose visual cut range contains t. */
export function segmentAt(layout: Layout, t: number): Segment | null {
  for (const s of layout.segments) if (t >= s.cutIn && t < s.cutOut) return s;
  return layout.segments[layout.segments.length - 1] ?? null;
}

/** Sum the length that image clips must have to make the video match `target` seconds. */
export function solveImageDuration(
  project: Project,
  assets: Record<ID, AssetMeta>,
  target: number,
): number | null {
  const layout = computeLayout(project, assets);
  const images = layout.clips.filter((s) => assets[s.assetId!]?.kind === "image");
  if (!images.length) return null;
  const currentImageSum = images.reduce((acc, s) => acc + (s.end - s.start), 0);
  const delta = target - layout.duration;
  const per = (currentImageSum + delta) / images.length;
  return per;
}
