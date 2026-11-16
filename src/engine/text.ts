import type { TextAlign, TextAnim, TextAnimSpec, TextStyle } from "@/types/project";
import { cssFont, getFontEpoch, loadFontFor, getFont, snapWeight } from "@/lib/fonts";
import { clamp01, ease, lerp, rgba } from "@/lib/util";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CharSlice {
  /** Pixel x of the glyph within the bitmap. */
  x0: number;
  x1: number;
}

interface LineSlice {
  y0: number;
  y1: number;
  chars: CharSlice[];
  center: number;
}

export interface TextBitmap {
  fg: OffscreenCanvas;
  bg: OffscreenCanvas | null;
  /** Bitmap size in pixels. */
  pw: number;
  ph: number;
  /** Box (without bleed) in logical units. */
  boxW: number;
  boxH: number;
  /** Bleed in logical units. */
  bleed: number;
  scale: number;
  lines: LineSlice[];
  charCount: number;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const measureCanvas = new OffscreenCanvas(8, 8);
const mctx = measureCanvas.getContext("2d")!;

const LATIN = /[A-Za-z0-9'’\-.,!?:;%&@#$()]/;

function tokenize(paragraph: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  for (const ch of paragraph) {
    if (LATIN.test(ch)) {
      buf += ch;
    } else {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      tokens.push(ch);
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function wrap(text: string, maxWidth: number, ls: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!maxWidth || maxWidth <= 0) {
      out.push(para);
      continue;
    }
    let line = "";
    for (const tok of tokenize(para)) {
      const candidate = line + tok;
      const w = mctx.measureText(candidate).width + ls * [...candidate].length;
      if (w > maxWidth && line.trim()) {
        out.push(line.trimEnd());
        line = tok.trimStart();
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}

interface PresetMetrics {
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  bleed: number;
  hasBg: boolean;
}

function presetMetrics(style: TextStyle): PresetMetrics {
  const em = style.fontSize;
  switch (style.preset) {
    case "tag":
      return { padL: em * 0.45, padR: em * 0.45, padT: em * 0.18, padB: em * 0.18, bleed: em * 0.25, hasBg: true };
    case "pill":
      return { padL: em * 0.7, padR: em * 0.7, padT: em * 0.2, padB: em * 0.2, bleed: em * 0.25, hasBg: true };
    case "glass":
      return { padL: em * 0.55, padR: em * 0.55, padT: em * 0.26, padB: em * 0.26, bleed: em * 0.3, hasBg: true };
    case "boxed":
      return { padL: em * 0.55, padR: em * 0.55, padT: em * 0.26, padB: em * 0.26, bleed: em * 0.3, hasBg: true };
    case "bar":
      return { padL: em * 0.5, padR: 0, padT: em * 0.04, padB: em * 0.04, bleed: em * 0.35, hasBg: true };
    case "underline":
      return { padL: 0, padR: 0, padT: 0, padB: em * 0.3, bleed: em * 0.35, hasBg: true };
    case "neon":
      return { padL: 0, padR: 0, padT: 0, padB: 0, bleed: em * 0.7, hasBg: false };
    case "outline":
      return { padL: 0, padR: 0, padT: 0, padB: 0, bleed: em * 0.25, hasBg: false };
    default:
      return { padL: 0, padR: 0, padT: 0, padB: 0, bleed: em * 0.35, hasBg: false };
  }
}

/* ------------------------------------------------------------------ */
/* Bitmap cache                                                        */
/* ------------------------------------------------------------------ */

const cache = new Map<string, TextBitmap>();
const MAX_CACHE = 240;

export function clearTextCache() {
  cache.clear();
}

function styleKey(s: TextStyle): string {
  return `${s.preset}|${s.fontId}|${s.fontSize}|${s.fontWeight}|${s.color}|${s.accent}|${s.letterSpacing}|${s.align}`;
}

export function getTextBitmap(text: string, style: TextStyle, scale: number, maxWidth = 0): TextBitmap {
  const key = `${getFontEpoch()}|${scale.toFixed(4)}|${maxWidth}|${styleKey(style)}|${text}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const font = getFont(style.fontId);
  // Kick off glyph loading; the epoch bump will invalidate this entry later.
  if (font.primary && !document.fonts.check(`${snapWeight(font, style.fontWeight)} 48px "${font.primary}"`, text || "a")) {
    void loadFontFor(style.fontId, style.fontWeight, text);
  }
  const bmp = buildBitmap(text, style, scale, maxWidth);
  cache.set(key, bmp);
  if (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return bmp;
}

function buildBitmap(text: string, style: TextStyle, scale: number, maxWidth: number): TextBitmap {
  const m = presetMetrics(style);
  const px = style.fontSize * scale;
  const ls = style.letterSpacing * scale;
  mctx.font = cssFont(style.fontId, style.fontWeight, px);
  mctx.letterSpacing = "0px";

  const lines = wrap(text || " ", maxWidth * scale, ls);
  const lineH = px * 1.32;
  const measured = lines.map((ln) => {
    const chars: { ch: string; x: number; w: number }[] = [];
    let x = 0;
    for (const ch of ln) {
      const w = mctx.measureText(ch).width;
      chars.push({ ch, x, w });
      x += w + ls;
    }
    const width = Math.max(0, x - (chars.length ? ls : 0));
    return { text: ln, chars, width };
  });
  const textW = Math.max(1, ...measured.map((l) => l.width));
  const textH = lineH * lines.length;
  const padL = m.padL * scale;
  const padR = m.padR * scale;
  const padT = m.padT * scale;
  const padB = m.padB * scale;
  const bleed = Math.ceil(m.bleed * scale);
  const boxW = textW + padL + padR;
  const boxH = textH + padT + padB;
  const pw = Math.max(2, Math.ceil(boxW + bleed * 2));
  const ph = Math.max(2, Math.ceil(boxH + bleed * 2));

  const fg = new OffscreenCanvas(pw, ph);
  const g = fg.getContext("2d")!;
  g.font = mctx.font;
  g.textBaseline = "middle";
  g.textAlign = "left";

  // Layout lines horizontally per alignment.
  const lineSlices: LineSlice[] = [];
  const placed = measured.map((l, i) => {
    let lx = 0;
    if (style.align === "center") lx = (textW - l.width) / 2;
    else if (style.align === "right") lx = textW - l.width;
    const ox = bleed + padL + lx;
    const cy = bleed + padT + lineH * (i + 0.5);
    return { ...l, ox, cy };
  });

  const drawGlyphs = (fill: string | CanvasGradient, mode: "fill" | "stroke") => {
    for (const l of placed) {
      for (const c of l.chars) {
        if (c.ch === " ") continue;
        if (mode === "fill") {
          g.fillStyle = fill;
          g.fillText(c.ch, l.ox + c.x, l.cy);
        } else {
          g.strokeText(c.ch, l.ox + c.x, l.cy);
        }
      }
    }
  };

  const em = px;
  const shadow = (color: string, blur: number, oy = 0) => {
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.shadowOffsetX = 0;
    g.shadowOffsetY = oy;
  };
  const noShadow = () => {
    g.shadowColor = "transparent";
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
  };

  switch (style.preset) {
    case "outline": {
      g.lineJoin = "round";
      g.miterLimit = 2;
      g.strokeStyle = style.accent;
      g.lineWidth = em * 0.16;
      drawGlyphs(style.color, "stroke");
      drawGlyphs(style.color, "fill");
      break;
    }
    case "neon": {
      shadow(style.accent, em * 0.5);
      drawGlyphs(style.accent, "fill");
      shadow(style.accent, em * 0.2);
      drawGlyphs(style.color, "fill");
      noShadow();
      drawGlyphs(style.color, "fill");
      break;
    }
    case "gradient": {
      const grad = g.createLinearGradient(0, bleed + padT, 0, bleed + padT + textH);
      grad.addColorStop(0, style.color);
      grad.addColorStop(1, style.accent);
      shadow("rgba(0,0,0,0.45)", em * 0.2, em * 0.04);
      drawGlyphs(grad, "fill");
      break;
    }
    case "tag":
    case "pill":
    case "plain":
      drawGlyphs(style.color, "fill");
      break;
    case "glass":
    case "boxed":
      shadow("rgba(0,0,0,0.35)", em * 0.12, em * 0.02);
      drawGlyphs(style.color, "fill");
      break;
    default:
      // shadow / bar / underline
      shadow("rgba(0,0,0,0.6)", em * 0.28, em * 0.05);
      drawGlyphs(style.color, "fill");
  }

  // Background decorations.
  let bg: OffscreenCanvas | null = null;
  if (m.hasBg) {
    bg = new OffscreenCanvas(pw, ph);
    const b = bg.getContext("2d")!;
    const bx = bleed;
    const by = bleed;
    switch (style.preset) {
      case "tag":
        b.fillStyle = style.accent;
        b.beginPath();
        b.roundRect(bx, by, boxW, boxH, em * 0.08);
        b.fill();
        break;
      case "pill":
        b.fillStyle = style.accent;
        b.beginPath();
        b.roundRect(bx, by, boxW, boxH, boxH / 2);
        b.fill();
        break;
      case "glass":
        b.fillStyle = "rgba(14,11,9,0.55)";
        b.beginPath();
        b.roundRect(bx, by, boxW, boxH, em * 0.24);
        b.fill();
        b.strokeStyle = "rgba(255,255,255,0.16)";
        b.lineWidth = Math.max(1, em * 0.03);
        b.stroke();
        break;
      case "boxed":
        b.strokeStyle = style.accent;
        b.lineWidth = Math.max(2, em * 0.06);
        b.strokeRect(bx + b.lineWidth / 2, by + b.lineWidth / 2, boxW - b.lineWidth, boxH - b.lineWidth);
        break;
      case "bar": {
        b.shadowColor = "rgba(0,0,0,0.45)";
        b.shadowBlur = em * 0.2;
        b.fillStyle = style.accent;
        b.fillRect(bx, by + padT + em * 0.12, em * 0.13, textH - em * 0.24);
        break;
      }
      case "underline": {
        b.shadowColor = "rgba(0,0,0,0.45)";
        b.shadowBlur = em * 0.2;
        b.fillStyle = style.accent;
        b.fillRect(bx, by + padT + textH + em * 0.06, boxW, em * 0.12);
        break;
      }
    }
  }

  // Char slices that partition the whole bitmap (used for per-character animation).
  placed.forEach((l, i) => {
    const y0 = i === 0 ? 0 : Math.floor(l.cy - lineH / 2);
    const y1 = i === placed.length - 1 ? ph : Math.floor(l.cy + lineH / 2);
    const chars: CharSlice[] = l.chars.map((c, j) => ({
      x0: j === 0 ? Math.max(0, Math.floor(l.ox + c.x - bleed)) : Math.floor(l.ox + c.x - ls / 2),
      x1: j === l.chars.length - 1 ? Math.min(pw, Math.ceil(l.ox + c.x + c.w + bleed)) : Math.ceil(l.ox + c.x + c.w + ls / 2),
    }));
    lineSlices.push({ y0, y1, chars, center: l.ox + l.width / 2 });
  });

  return {
    fg,
    bg,
    pw,
    ph,
    boxW: boxW / scale,
    boxH: boxH / scale,
    bleed: bleed / scale,
    scale,
    lines: lineSlices,
    charCount: lineSlices.reduce((a, l) => a + l.chars.length, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Drawing with animation                                              */
/* ------------------------------------------------------------------ */

export function boxFor(bmp: TextBitmap, x: number, y: number, align: TextAlign): Box {
  const w = bmp.boxW;
  const h = bmp.boxH;
  const bx = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  return { x: bx, y: y - h / 2, w, h };
}

interface AnimState {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  /** 0..1 horizontal reveal from the left (1 = fully visible). */
  reveal: number;
  /** Per-char mode. */
  chars: null | { kind: "typewriter" | "bounce" | "spread"; e: number };
  bgAlpha: number;
}

function animState(kind: TextAnim, e: number, entering: boolean, em: number): AnimState {
  const s: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, reveal: 1, chars: null, bgAlpha: 1 };
  if (e >= 1) return s;
  switch (kind) {
    case "none":
      break;
    case "fade":
      s.alpha = ease.outQuad(e);
      break;
    case "rise":
      s.alpha = ease.outQuad(e);
      s.dy = (1 - ease.outCubic(e)) * em * 0.7;
      break;
    case "slide-left":
      s.alpha = ease.outQuad(e);
      s.dx = -(1 - ease.outCubic(e)) * Math.max(80, em * 2);
      break;
    case "slide-right":
      s.alpha = ease.outQuad(e);
      s.dx = (1 - ease.outCubic(e)) * Math.max(80, em * 2);
      break;
    case "pop":
      s.alpha = clamp01(e * 2.2);
      s.scale = entering ? lerp(0.4, 1, ease.outBack(e)) : lerp(0.85, 1, e);
      break;
    case "wipe":
      s.reveal = ease.inOutCubic(e);
      break;
    case "typewriter":
      if (entering) s.chars = { kind: "typewriter", e };
      else s.alpha = e;
      s.bgAlpha = clamp01(e * 5);
      break;
    case "bounce":
      if (entering) s.chars = { kind: "bounce", e };
      else s.alpha = e;
      s.bgAlpha = clamp01(e * 3);
      break;
    case "spread":
      s.chars = { kind: "spread", e };
      s.bgAlpha = ease.outQuad(e);
      break;
  }
  return s;
}

/**
 * Draw a text block with entrance/exit animation.
 * `local` is seconds since the item appeared, `dur` its total visible duration.
 * The context must already be in logical (1920x1080) coordinates.
 */
export function drawTextBlock(
  ctx: Ctx2D,
  bmp: TextBitmap,
  x: number,
  y: number,
  align: TextAlign,
  local: number,
  dur: number,
  anim: TextAnimSpec | null,
  opacity = 1,
): Box {
  const box = boxFor(bmp, x, y, align);
  let st: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, reveal: 1, chars: null, bgAlpha: 1 };
  if (anim && dur > 0) {
    let inDur = anim.in === "none" ? 0 : anim.inDur;
    let outDur = anim.out === "none" ? 0 : anim.outDur;
    if (inDur + outDur > dur) {
      const k = dur / (inDur + outDur);
      inDur *= k;
      outDur *= k;
    }
    if (inDur > 0 && local < inDur) st = animState(anim.in, clamp01(local / inDur), true, bmp.boxH);
    else if (outDur > 0 && local > dur - outDur) st = animState(anim.out, clamp01((dur - local) / outDur), false, bmp.boxH);
  }
  const alpha = st.alpha * opacity;
  if (alpha <= 0.001) return box;

  const inv = 1 / bmp.scale;
  const ox = box.x - bmp.bleed + st.dx;
  const oy = box.y - bmp.bleed + st.dy;
  const lw = bmp.pw * inv;
  const lh = bmp.ph * inv;

  ctx.save();
  ctx.globalAlpha *= alpha;
  if (st.scale !== 1) {
    const cx = box.x + box.w / 2 + st.dx;
    const cy = box.y + box.h / 2 + st.dy;
    ctx.translate(cx, cy);
    ctx.scale(st.scale, st.scale);
    ctx.translate(-cx, -cy);
  }
  if (st.reveal < 1) {
    ctx.beginPath();
    ctx.rect(ox, oy - 2, lw * st.reveal, lh + 4);
    ctx.clip();
  }

  if (bmp.bg) {
    if (st.bgAlpha < 1) {
      ctx.save();
      ctx.globalAlpha *= st.bgAlpha;
      ctx.drawImage(bmp.bg, ox, oy, lw, lh);
      ctx.restore();
    } else {
      ctx.drawImage(bmp.bg, ox, oy, lw, lh);
    }
  }

  if (!st.chars) {
    ctx.drawImage(bmp.fg, ox, oy, lw, lh);
  } else {
    drawChars(ctx, bmp, ox, oy, st.chars.kind, st.chars.e);
  }
  ctx.restore();
  return box;
}

function drawChars(ctx: Ctx2D, bmp: TextBitmap, ox: number, oy: number, kind: "typewriter" | "bounce" | "spread", e: number) {
  const inv = 1 / bmp.scale;
  const n = Math.max(1, bmp.charCount);
  const centerX = bmp.pw / 2;
  let idx = 0;
  const visible = Math.floor(e * n + 0.0001);
  const baseAlpha = ctx.globalAlpha;
  for (const line of bmp.lines) {
    for (const c of line.chars) {
      const sw = c.x1 - c.x0;
      const sh = line.y1 - line.y0;
      if (sw <= 0 || sh <= 0) {
        idx++;
        continue;
      }
      let dx = 0;
      let dy = 0;
      let a = 1;
      if (kind === "typewriter") {
        if (idx >= visible) break;
      } else if (kind === "bounce") {
        const delay = (idx / n) * 0.55;
        const k = clamp01((e - delay) / 0.45);
        if (k <= 0) {
          idx++;
          continue;
        }
        dy = -(1 - ease.outBack(k)) * (sh * inv) * 0.9;
        a = clamp01(k * 2);
      } else {
        const cx = (c.x0 + c.x1) / 2;
        const k = ease.outCubic(e);
        dx = (centerX - cx) * (1 - k) * 0.55 * inv;
        a = ease.outQuad(e);
      }
      ctx.globalAlpha = baseAlpha * a;
      ctx.drawImage(bmp.fg, c.x0, line.y0, sw, sh, ox + c.x0 * inv + dx, oy + line.y0 * inv + dy, sw * inv, sh * inv);
      idx++;
    }
    if (kind === "typewriter" && idx >= visible) break;
  }
  ctx.globalAlpha = baseAlpha;
}

/** Convenience: draw a static or animated text at an anchor. */
export function drawText(
  ctx: Ctx2D,
  text: string,
  style: TextStyle,
  scale: number,
  x: number,
  y: number,
  opts: { local?: number; dur?: number; anim?: TextAnimSpec | null; opacity?: number; maxWidth?: number } = {},
): Box {
  if (!text) return { x, y, w: 0, h: 0 };
  const bmp = getTextBitmap(text, style, scale, opts.maxWidth ?? 0);
  return drawTextBlock(ctx, bmp, x, y, style.align, opts.local ?? 999, opts.dur ?? 0, opts.anim ?? null, opts.opacity ?? 1);
}

export const fadeOverlay = (ctx: Ctx2D, color: string, alpha: number, w: number, h: number) => {
  if (alpha <= 0) return;
  ctx.save();
  ctx.fillStyle = color.startsWith("#") ? rgba(color, alpha) : color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
};
