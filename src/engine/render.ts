import type { Clip, MotionType } from "@/types/project";
import type { Segment } from "@/engine/timeline";
import { activeSegments } from "@/engine/timeline";
import { drawTransition } from "@/engine/transitions";
import { drawText, getTextBitmap, drawTextBlock, type Ctx2D } from "@/engine/text";
import { drawIntro, drawOutro, drawTitle } from "@/engine/scenes";
import { drawBlurBackdrop, drawFitted, type HitBox, type RenderContext } from "@/engine/draw";
import { CONCRETE_MOTIONS } from "@/engine/catalog";
import { DESIGN_H as H, DESIGN_W as W, clamp01, ease, hashString, lerp } from "@/lib/util";

/**
 * Render one frame at time `t`. The context must already be scaled so that
 * one unit equals one logical pixel of the 1920x1080 design space.
 */
export function renderFrame(ctx: Ctx2D, rc: RenderContext, t: number) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = rc.scale > 1 ? "high" : "medium";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const { a, b, p } = activeSegments(rc.layout, t);
  if (a && b && b.transIn) {
    drawTransition(
      ctx,
      b.transIn.type,
      p,
      (c) => drawSegment(c, rc, a, t),
      (c) => drawSegment(c, rc, b, t),
      rc,
    );
  } else if (a) {
    drawSegment(ctx, rc, a, t);
  }

  drawLogo(ctx, rc, t);
  drawCaption(ctx, rc, t);
  drawTexts(ctx, rc, t);
  drawSubtitles(ctx, rc, t);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

function drawSegment(ctx: Ctx2D, rc: RenderContext, seg: Segment, t: number) {
  const local = Math.max(0, t - seg.start);
  const dur = seg.end - seg.start;
  ctx.save();
  switch (seg.kind) {
    case "intro":
      if (seg.assetId) drawVideoSegment(ctx, rc, seg, local, 0, 1);
      else drawIntro(ctx, rc, local, dur);
      break;
    case "outro":
      if (seg.assetId) drawVideoSegment(ctx, rc, seg, local, 0, 1);
      else drawOutro(ctx, rc, local, dur);
      break;
    case "title":
      drawTitle(ctx, rc, local, dur);
      break;
    case "clip":
      drawClip(ctx, rc, seg, local, dur);
      break;
  }
  ctx.restore();
}

function drawVideoSegment(ctx: Ctx2D, rc: RenderContext, seg: Segment, local: number, trimIn: number, volume: number) {
  const frame = rc.sources.video(seg.key, seg.assetId!, trimIn + local, volume);
  const bg = rc.project.style.brand.background;
  if (frame) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    drawFitted(ctx, frame, "contain");
  } else {
    drawBlurBackdrop(ctx, rc.sources.blur(seg.assetId!), bg, 0.2);
  }
}

export function resolveMotion(clip: Clip, seqIndex: number): MotionType {
  if (clip.motion !== "auto") return clip.motion;
  const h = hashString(clip.id) + seqIndex;
  return CONCRETE_MOTIONS[h % CONCRETE_MOTIONS.length];
}

function drawClip(ctx: Ctx2D, rc: RenderContext, seg: Segment, local: number, dur: number) {
  const clip = seg.clip!;
  const asset = rc.assets[clip.assetId];
  if (!asset) return;
  const blur = rc.sources.blur(asset.id);
  const isVideo = asset.kind === "video";
  let src = isVideo
    ? rc.sources.video(seg.key, asset.id, clip.trimIn + local, clip.muted ? 0 : clip.volume)
    : rc.sources.image(asset.id);
  // While a video frame is not ready yet, show its poster frame.
  if (!src && isVideo) src = rc.sources.image(asset.id);

  const p = clamp01(local / Math.max(0.01, dur));
  const strength = rc.project.style.sequence.motionStrength;
  const motion = resolveMotion(clip, seg.seqIndex);
  let zoom = 1;
  let ox = 0;
  let oy = 0;
  const k = ease.inOutSine(p);
  const zoomAmt = 0.16 * strength;
  const pan = 0.045 * strength;
  switch (motion) {
    case "zoom-in":
      zoom = 1 + zoomAmt * k;
      break;
    case "zoom-out":
      zoom = 1 + zoomAmt * (1 - k);
      break;
    case "pan-left":
      zoom = 1 + pan * 2.2;
      ox = lerp(pan, -pan, k) * W;
      break;
    case "pan-right":
      zoom = 1 + pan * 2.2;
      ox = lerp(-pan, pan, k) * W;
      break;
    case "pan-up":
      zoom = 1 + pan * 2.2 * (W / H);
      oy = lerp(pan, -pan, k) * H;
      break;
    case "pan-down":
      zoom = 1 + pan * 2.2 * (W / H);
      oy = lerp(-pan, pan, k) * H;
      break;
  }

  if (clip.fit === "contain") {
    drawBlurBackdrop(ctx, blur, "#111", 0.35, 1.15);
    if (src) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 30 * rc.scale;
      drawFitted(ctx, src, "contain", zoom * 0.94, ox * 0.5, oy * 0.5);
      ctx.restore();
    }
    return;
  }
  if (!src) src = blur;
  if (!src) {
    ctx.fillStyle = "#1C1815";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  drawFitted(ctx, src, "cover", zoom, ox, oy);
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

function pushHit(rc: RenderContext, h: HitBox) {
  if (rc.hits) rc.hits.push(h);
}

function drawLogo(ctx: Ctx2D, rc: RenderContext, t: number) {
  const { layout, project } = rc;
  const brand = project.style.brand;
  const { logoStart, logoEnd } = layout;
  if (t < logoStart || t >= logoEnd) return;
  const fade = 0.4;
  const a = Math.min(clamp01((t - logoStart) / fade), clamp01((logoEnd - t) / fade));
  const L = brand.logo;
  const img = brand.logoAssetId ? rc.sources.image(brand.logoAssetId) : null;
  if (!img || !img.width) {
    // Placeholder box so the logo slot can still be grabbed in the editor.
    pushHit(rc, { kind: "logo", id: "logo", x: L.marginX, y: L.marginY, w: L.size, h: L.size * 0.4 });
    return;
  }
  const w = L.size;
  const h = (img.height / img.width) * w;
  ctx.save();
  ctx.globalAlpha *= a * L.opacity;
  if (L.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 16 * rc.scale;
    ctx.shadowOffsetY = 2 * rc.scale;
  }
  ctx.drawImage(img.source, L.marginX, L.marginY, w, h);
  ctx.restore();
  pushHit(rc, { kind: "logo", id: "logo", x: L.marginX, y: L.marginY, w, h });
}

function drawCaption(ctx: Ctx2D, rc: RenderContext, t: number) {
  const cs = rc.project.style.caption;
  if (!cs.enabled) return;
  for (const run of rc.layout.captionRuns) {
    if (t < run.start || t >= run.end) continue;
    const pos = run.group.captionPos ?? cs.pos;
    const bmp = getTextBitmap(run.group.name, cs.style, rc.scale);
    const box = drawTextBlock(ctx, bmp, pos.x, pos.y, cs.style.align, t - run.start, run.end - run.start, cs.anim);
    pushHit(rc, { kind: "caption", id: run.group.id, ...box });
  }
}

function drawTexts(ctx: Ctx2D, rc: RenderContext, t: number) {
  for (const item of rc.project.texts) {
    if (t < item.start || t >= item.start + item.duration) continue;
    const box = drawText(ctx, item.text, item.style, rc.scale, item.pos.x, item.pos.y, {
      local: t - item.start,
      dur: item.duration,
      anim: item.anim,
    });
    pushHit(rc, { kind: "text", id: item.id, ...box });
  }
}

function drawSubtitles(ctx: Ctx2D, rc: RenderContext, t: number) {
  const { subtitles, style } = rc.project;
  const tracks = [
    { cues: subtitles.top, s: style.subtitleTop, kind: "sub-top" as const },
    { cues: subtitles.bottom, s: style.subtitleBottom, kind: "sub-bottom" as const },
  ];
  for (const tr of tracks) {
    if (!tr.s.enabled) continue;
    const cue = findCue(tr.cues, t);
    if (!cue) continue;
    const dur = cue.end - cue.start;
    const fade = Math.min(0.12, dur / 4);
    const a = Math.min(clamp01((t - cue.start) / fade), clamp01((cue.end - t) / fade));
    const box = drawText(ctx, cue.text, { ...tr.s.style, align: "center" }, rc.scale, W / 2, tr.s.y, {
      opacity: a,
      maxWidth: tr.s.maxWidth,
    });
    pushHit(rc, { kind: tr.kind, id: cue.id, ...box });
  }
}

function findCue<T extends { start: number; end: number }>(cues: T[], t: number): T | null {
  let lo = 0;
  let hi = cues.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  // Cues may overlap slightly; check a couple of candidates.
  for (let i = idx; i >= 0 && i >= idx - 2; i--) {
    const c = cues[i];
    if (t >= c.start && t < c.end) return c;
  }
  return null;
}
