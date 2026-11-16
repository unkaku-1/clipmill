import type { Draft } from "immer";
import type { AssetMeta, ID, MotionType, Project, RandomPool, TransitionType } from "@/types/project";
import { CONCRETE_MOTIONS, transitionPool } from "@/engine/catalog";
import { computeLayout, solveImageDuration } from "@/engine/timeline";
import { MIN_CLIP, snapFrame } from "@/lib/util";

function pickDifferent<T>(pool: T[], prev: T | null, rnd = Math.random): T {
  if (pool.length <= 1) return pool[0];
  let v = pool[Math.floor(rnd() * pool.length)];
  let guard = 0;
  while (v === prev && guard++ < 8) v = pool[Math.floor(rnd() * pool.length)];
  return v;
}

/**
 * Give every clip (or only `onlyIds`) a random transition from the pool,
 * never repeating the same effect twice in a row.
 */
export function randomizeTransitions(d: Draft<Project>, pool: RandomPool, onlyIds?: Set<ID>, duration?: number) {
  const list = transitionPool(pool);
  let prev: TransitionType | null = null;
  for (const g of d.groups) {
    for (const c of g.clips) {
      if (onlyIds && !onlyIds.has(c.id)) {
        prev = c.transition.type;
        continue;
      }
      const type: TransitionType = pickDifferent<TransitionType>(list, prev);
      c.transition.type = type;
      if (duration) c.transition.duration = duration;
      else if (c.transition.duration < 0.2) c.transition.duration = 0.6;
      prev = type;
    }
  }
}

export function randomizeMotions(d: Draft<Project>, assets: Record<ID, AssetMeta>, onlyIds?: Set<ID>) {
  let prev: MotionType | null = null;
  for (const g of d.groups) {
    for (const c of g.clips) {
      if (assets[c.assetId]?.kind !== "image") continue;
      if (onlyIds && !onlyIds.has(c.id)) continue;
      const m: MotionType = pickDifferent<MotionType>(CONCRETE_MOTIONS, prev);
      c.motion = m;
      prev = m;
    }
  }
}

export function applyTransitionToAll(d: Draft<Project>, type: TransitionType, duration: number) {
  for (const g of d.groups) for (const c of g.clips) c.transition = { type, duration };
}

export function setAllImageDurations(d: Draft<Project>, assets: Record<ID, AssetMeta>, seconds: number) {
  const v = snapFrame(Math.max(MIN_CLIP, seconds));
  for (const g of d.groups) for (const c of g.clips) if (assets[c.assetId]?.kind === "image") c.duration = v;
}

/** End of the music bed (seconds), or 0 when there is no music. */
export function musicEnd(p: Project): number {
  return p.audio.reduce((m, a) => Math.max(m, a.start + a.duration), 0);
}

/**
 * Stretch or shrink all still images equally so the whole video lasts exactly
 * as long as the background music. Returns the new per-image duration.
 */
export function fitImagesToDuration(
  p: Project,
  assets: Record<ID, AssetMeta>,
  target: number,
): { ok: true; per: number } | { ok: false; reason: string } {
  const per = solveImageDuration(p, assets, target);
  if (per === null) return { ok: false, reason: "工程里还没有图片素材" };
  if (per < MIN_CLIP + 0.3) {
    return { ok: false, reason: `音乐太短：每张图片只能分到 ${per.toFixed(2)} 秒，请减少图片或换一首更长的音乐` };
  }
  return { ok: true, per };
}

/**
 * Refine the fit: transitions are clamped by clip length, so the first solve
 * may be off by a few frames. Iterate a couple of times on the real layout.
 */
export function refineFit(
  apply: (per: number) => Project,
  assets: Record<ID, AssetMeta>,
  target: number,
  per0: number,
): number {
  let per = per0;
  for (let i = 0; i < 3; i++) {
    const p = apply(per);
    const dur = computeLayout(p, assets).duration;
    const images = p.groups.flatMap((g) => g.clips).filter((c) => assets[c.assetId]?.kind === "image").length;
    const err = target - dur;
    if (Math.abs(err) < 1 / 120 || !images) break;
    per += err / images;
  }
  return per;
}

/** Sort clips inside every group by file name (natural order). */
export function sortClipsByName(d: Draft<Project>, assets: Record<ID, AssetMeta>) {
  const coll = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
  for (const g of d.groups) {
    g.clips.sort((a, b) => coll.compare(assets[a.assetId]?.name ?? "", assets[b.assetId]?.name ?? ""));
  }
}
