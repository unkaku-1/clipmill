import type { AssetMeta, ID, Project } from "@/types/project";
import type { Layout } from "@/engine/timeline";
import type { Ctx2D } from "@/engine/text";
import type { ScratchProvider } from "@/engine/transitions";
import { DESIGN_H as H, DESIGN_W as W, rgba } from "@/lib/util";

export interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Supplies decoded pixels to the renderer. The preview implementation returns
 * low-resolution proxies (and null while loading); the export implementation
 * returns full-quality frames that were prepared before the frame is drawn.
 */
export interface FrameSources {
  image(assetId: ID): Drawable | null;
  blur(assetId: ID): Drawable | null;
  /** `key` identifies the timeline slot (a clip may reuse an asset). */
  video(key: string, assetId: ID, sourceTime: number, volume: number): Drawable | null;
}

export type HitKind = "logo" | "caption" | "text" | "sub-top" | "sub-bottom";

export interface HitBox {
  kind: HitKind;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderContext extends ScratchProvider {
  project: Project;
  layout: Layout;
  assets: Record<ID, AssetMeta>;
  sources: FrameSources;
  /** Collect hit boxes for the interactive editor overlay. */
  hits: HitBox[] | null;
}

/** Draw an image so that it covers (or fits inside) the frame, with optional zoom/offset. */
export function drawFitted(
  ctx: Ctx2D,
  d: Drawable,
  mode: "cover" | "contain",
  zoom = 1,
  ox = 0,
  oy = 0,
  rect: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: W, h: H },
) {
  if (!d.width || !d.height) return;
  const s = mode === "cover" ? Math.max(rect.w / d.width, rect.h / d.height) : Math.min(rect.w / d.width, rect.h / d.height);
  const w = d.width * s * zoom;
  const h = d.height * s * zoom;
  const x = rect.x + (rect.w - w) / 2 + ox;
  const y = rect.y + (rect.h - h) / 2 + oy;
  ctx.drawImage(d.source, x, y, w, h);
}

/** Background used behind "contain" shots and blurred titles. */
export function drawBlurBackdrop(ctx: Ctx2D, blur: Drawable | null, fallback: string, dim = 0.45, zoom = 1.1) {
  ctx.fillStyle = fallback;
  ctx.fillRect(0, 0, W, H);
  if (blur) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawFitted(ctx, blur, "cover", zoom);
    ctx.restore();
  }
  if (dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export function vignette(ctx: Ctx2D, strength = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Draw the brand logo centered at (cx, cy) inside a `size` box. Falls back to
 * a generated monogram when no logo has been uploaded.
 */
export function drawLogoMark(
  ctx: Ctx2D,
  rc: RenderContext,
  cx: number,
  cy: number,
  size: number,
  alpha = 1,
  scale = 1,
) {
  if (alpha <= 0.001 || scale <= 0.001) return;
  const brand = rc.project.style.brand;
  const logo = brand.logoAssetId ? rc.sources.image(brand.logoAssetId) : null;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  if (logo && logo.width && logo.height) {
    const s = Math.min(size / logo.width, size / logo.height);
    const w = logo.width * s;
    const h = logo.height * s;
    ctx.drawImage(logo.source, -w / 2, -h / 2, w, h);
  } else {
    const r = size * 0.22;
    ctx.fillStyle = brand.primary;
    ctx.beginPath();
    ctx.roundRect(-size / 2, -size / 2, size, size, r);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${size * 0.5}px "Noto Sans SC", "PingFang SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ch = [...(brand.name || "C")][0];
    ctx.fillText(ch.toUpperCase(), 0, size * 0.03);
  }
  ctx.restore();
}

export function radialBackground(ctx: Ctx2D, base: string, glow: string, glowAlpha = 0.25) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.6);
  g.addColorStop(0, rgba(glow, glowAlpha));
  g.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
