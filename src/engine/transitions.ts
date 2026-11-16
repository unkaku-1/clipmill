import type { TransitionType } from "@/types/project";
import { DESIGN_H as H, DESIGN_W as W, ease, lerp } from "@/lib/util";
import type { Ctx2D } from "@/engine/text";

export type DrawFn = (ctx: Ctx2D) => void;

export interface ScratchProvider {
  /** A reusable offscreen canvas of the given pixel size. */
  scratch(id: string, w: number, h: number): OffscreenCanvas;
  /** Pixels per logical unit of the main canvas. */
  scale: number;
}

/**
 * Composite the outgoing shot A and incoming shot B.
 * `p` runs from 0 (only A) to 1 (only B). Coordinates are logical (1920x1080).
 */
export function drawTransition(
  ctx: Ctx2D,
  type: TransitionType,
  rawP: number,
  drawA: DrawFn,
  drawB: DrawFn,
  sp: ScratchProvider,
) {
  const p = Math.min(1, Math.max(0, rawP));
  const e = ease.inOutCubic(p);

  switch (type) {
    case "cut":
      (p < 0.5 ? drawA : drawB)(ctx);
      return;

    case "fade":
      drawA(ctx);
      withAlpha(ctx, p, () => drawB(ctx));
      return;

    case "fade-black":
    case "fade-white": {
      const color = type === "fade-black" ? "#000" : "#fff";
      if (p < 0.5) drawA(ctx);
      else drawB(ctx);
      const a = type === "fade-black" ? 1 - Math.abs(p * 2 - 1) : Math.pow(1 - Math.abs(p * 2 - 1), 0.8);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }

    case "slide-left":
    case "slide-right":
    case "slide-up":
    case "slide-down": {
      drawA(ctx);
      const k = 1 - ease.outCubic(p);
      const dx = type === "slide-left" ? k * W : type === "slide-right" ? -k * W : 0;
      const dy = type === "slide-up" ? k * H : type === "slide-down" ? -k * H : 0;
      ctx.save();
      // Dim the outgoing shot a little for depth.
      ctx.fillStyle = `rgba(0,0,0,${0.35 * ease.outQuad(p)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.translate(dx, dy);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 40 * sp.scale;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.shadowColor = "transparent";
      clipRect(ctx, 0, 0, W, H);
      drawB(ctx);
      ctx.restore();
      return;
    }

    case "push-left":
    case "push-right": {
      const dir = type === "push-left" ? -1 : 1;
      ctx.save();
      clipRect(ctx, 0, 0, W, H);
      ctx.save();
      ctx.translate(dir * e * W, 0);
      drawA(ctx);
      ctx.restore();
      ctx.save();
      ctx.translate(dir * (e - 1) * W, 0);
      drawB(ctx);
      ctx.restore();
      ctx.restore();
      return;
    }

    case "wipe-left":
    case "wipe-right":
    case "wipe-down": {
      drawA(ctx);
      ctx.save();
      if (type === "wipe-right") clipRect(ctx, 0, 0, W * e, H);
      else if (type === "wipe-left") clipRect(ctx, W * (1 - e), 0, W * e, H);
      else clipRect(ctx, 0, 0, W, H * e);
      drawB(ctx);
      ctx.restore();
      return;
    }

    case "diagonal": {
      drawA(ctx);
      // Region x + y*(W/H) < d, sweeping from the top-left corner.
      const d = lerp(0, W * 2, e);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(d, 0);
      ctx.lineTo(d - W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.clip();
      drawB(ctx);
      ctx.restore();
      return;
    }

    case "iris": {
      drawA(ctx);
      const r = ease.inCubic(p) * Math.hypot(W, H) * 0.52;
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.max(0.1, r), 0, Math.PI * 2);
      ctx.clip();
      drawB(ctx);
      ctx.restore();
      return;
    }

    case "zoom-in": {
      ctx.save();
      scaleAround(ctx, lerp(1.25, 1, ease.outCubic(p)));
      drawB(ctx);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= 1 - ease.inOutQuad(p);
      scaleAround(ctx, lerp(1, 1.6, ease.inCubic(p)));
      drawA(ctx);
      ctx.restore();
      return;
    }

    case "zoom-out": {
      ctx.save();
      scaleAround(ctx, lerp(1.35, 1, ease.outCubic(p)));
      drawB(ctx);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= 1 - ease.inOutQuad(p);
      scaleAround(ctx, lerp(1, 0.55, ease.inOutCubic(p)));
      drawA(ctx);
      ctx.restore();
      return;
    }

    case "blinds": {
      drawA(ctx);
      const n = 9;
      const sh = H / n;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const local = Math.min(1, Math.max(0, e * 1.4 - (i / n) * 0.4));
        ctx.rect(0, i * sh, W, sh * local + 0.5);
      }
      ctx.clip();
      drawB(ctx);
      ctx.restore();
      return;
    }

    case "split": {
      drawB(ctx);
      const off = ease.inOutCubic(p) * (W / 2);
      ctx.save();
      clipRect(ctx, 0, 0, W / 2 - off, H);
      ctx.translate(-off, 0);
      drawA(ctx);
      ctx.restore();
      ctx.save();
      clipRect(ctx, W / 2 + off, 0, W / 2 - off, H);
      ctx.translate(off, 0);
      drawA(ctx);
      ctx.restore();
      return;
    }

    case "rotate": {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha *= ease.outQuad(p);
      rotateScaleAround(ctx, lerp(0.35, 0, ease.outCubic(p)), lerp(1.6, 1, ease.outCubic(p)));
      drawB(ctx);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= 1 - ease.inQuad(p);
      rotateScaleAround(ctx, lerp(0, -0.35, ease.inCubic(p)), lerp(1, 0.5, ease.inCubic(p)));
      drawA(ctx);
      ctx.restore();
      return;
    }

    case "pixelate": {
      const tri = 1 - Math.abs(p * 2 - 1);
      const block = Math.max(1, Math.round(lerp(1, 56, ease.inQuad(tri))));
      const draw = p < 0.5 ? drawA : drawB;
      if (block <= 1) {
        draw(ctx);
        return;
      }
      const pw = Math.max(2, Math.round((W * sp.scale) / block));
      const ph = Math.max(2, Math.round((H * sp.scale) / block));
      const sc = sp.scratch("pixelate", pw, ph);
      const sctx = sc.getContext("2d")!;
      sctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
      sctx.globalAlpha = 1;
      sctx.imageSmoothingEnabled = true;
      sctx.fillStyle = "#000";
      sctx.fillRect(0, 0, W, H);
      draw(sctx);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sc, 0, 0, pw, ph, 0, 0, W, H);
      ctx.restore();
      return;
    }
  }
}

function withAlpha(ctx: Ctx2D, a: number, fn: () => void) {
  ctx.save();
  ctx.globalAlpha *= a;
  fn();
  ctx.restore();
}

function clipRect(ctx: Ctx2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.rect(x, y, Math.max(0, w), Math.max(0, h));
  ctx.clip();
}

function scaleAround(ctx: Ctx2D, s: number) {
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
}

function rotateScaleAround(ctx: Ctx2D, angle: number, s: number) {
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angle);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
}
