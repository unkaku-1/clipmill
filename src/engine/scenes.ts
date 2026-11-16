import type { TextStyle } from "@/types/project";
import type { Ctx2D } from "@/engine/text";
import { drawText, getTextBitmap, drawTextBlock } from "@/engine/text";
import {
  drawBlurBackdrop,
  drawLogoMark,
  radialBackground,
  vignette,
  type RenderContext,
} from "@/engine/draw";
import { DESIGN_H as H, DESIGN_W as W, clamp01, ease, lerp, mulberry32, rgba, shade } from "@/lib/util";

const st = (partial: Partial<TextStyle>): TextStyle => ({
  preset: "plain",
  fontId: "noto-sans",
  fontSize: 64,
  fontWeight: 700,
  color: "#FFFFFF",
  accent: "#FF5A36",
  letterSpacing: 0,
  align: "center",
  ...partial,
});

const seg01 = (t: number, start: number, len: number) => clamp01((t - start) / len);

/* ================================================================== */
/* Intros                                                              */
/* ================================================================== */

export function drawIntro(ctx: Ctx2D, rc: RenderContext, t: number, dur: number) {
  const b = rc.project.style.brand;
  switch (b.intro.template) {
    case "film-leader":
      return introFilmLeader(ctx, rc, t, dur);
    case "stripes":
      return introStripes(ctx, rc, t, dur);
    case "line-draw":
      return introLineDraw(ctx, rc, t, dur);
    case "particles":
      return introParticles(ctx, rc, t, dur);
    default:
      return introLogoBurst(ctx, rc, t, dur);
  }
}

function brandLines(ctx: Ctx2D, rc: RenderContext, t: number, nameY: number, nameAt: number, sloganAt: number, nameSize = 84) {
  const b = rc.project.style.brand;
  drawText(ctx, b.name, st({ fontSize: nameSize, fontWeight: 900, letterSpacing: 4 }), rc.scale, W / 2, nameY, {
    local: t - nameAt,
    dur: 999,
    anim: { in: "rise", out: "none", inDur: 0.6, outDur: 0 },
    opacity: t >= nameAt ? 1 : 0,
  });
  if (b.slogan) {
    drawText(ctx, b.slogan, st({ fontSize: 36, fontWeight: 400, color: "#D9D2CC", letterSpacing: 6 }), rc.scale, W / 2, nameY + 86, {
      local: t - sloganAt,
      dur: 999,
      anim: { in: "fade", out: "none", inDur: 0.6, outDur: 0 },
      opacity: t >= sloganAt ? 1 : 0,
    });
  }
}

function introLogoBurst(ctx: Ctx2D, rc: RenderContext, t: number, dur: number) {
  const b = rc.project.style.brand;
  radialBackground(ctx, b.background, b.primary, 0.22);
  const push = 1 + 0.04 * ease.inOutSine(clamp01((t - (dur - 0.8)) / 0.8));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(push, push);
  ctx.translate(-W / 2, -H / 2);
  for (let i = 0; i < 4; i++) {
    const k = seg01(t, 0.1 + i * 0.22, 1.7);
    if (k <= 0 || k >= 1) continue;
    const r = ease.outCubic(k) * 980;
    ctx.beginPath();
    ctx.arc(W / 2, 430, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(i % 2 ? b.secondary : b.primary, (1 - k) * 0.9);
    ctx.lineWidth = lerp(10, 1, k);
    ctx.stroke();
  }
  const lk = seg01(t, 0.35, 0.7);
  drawLogoMark(ctx, rc, W / 2, 430, 250, clamp01(lk * 3), lerp(0.3, 1, ease.outBack(lk)));
  const lineK = ease.outExpo(seg01(t, 1.0, 0.7));
  ctx.fillStyle = b.primary;
  ctx.fillRect(W / 2 - 90 * lineK, 610, 180 * lineK, 5);
  brandLines(ctx, rc, t, 690, 0.8, 1.2);
  ctx.restore();
}

function introFilmLeader(ctx: Ctx2D, rc: RenderContext, t: number, dur: number) {
  const countdownEnd = Math.max(1.2, dur * 0.62);
  const frame = Math.floor(t * 24);
  const rnd = mulberry32(frame * 7919 + 13);
  if (t < countdownEnd) {
    const per = countdownEnd / 3;
    const idx = Math.min(2, Math.floor(t / per));
    const frac = (t - idx * per) / per;
    ctx.fillStyle = "#3B3733";
    ctx.fillRect(0, 0, W, H);
    // Sweep wedge
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.arc(W / 2, H / 2, 1200, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    for (const r of [300, 360]) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawText(ctx, String(3 - idx), st({ fontId: "bebas", fontSize: 440, fontWeight: 400, color: "#F4EFE8" }), rc.scale, W / 2, H / 2 + 20);
    // Grain and scratches
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (let i = 0; i < 70; i++) ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 2 + rnd() * 3);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i < 2; i++) ctx.fillRect(rnd() * W, 0, 1.5, H);
    ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
    ctx.fillRect(0, 0, W, H);
    vignette(ctx, 0.7);
  } else {
    const lt = t - countdownEnd;
    ctx.fillStyle = "#0D0B0A";
    ctx.fillRect(0, 0, W, H);
    // Sprocket holes travelling along the film edges.
    const off = (t * 220) % 96;
    ctx.fillStyle = "#26211D";
    ctx.fillRect(0, 0, W, 70);
    ctx.fillRect(0, H - 70, W, 70);
    ctx.fillStyle = "#0D0B0A";
    for (let x = -96 + off; x < W + 96; x += 96) {
      ctx.beginPath();
      ctx.roundRect(x, 20, 44, 30, 6);
      ctx.roundRect(x, H - 50, 44, 30, 6);
      ctx.fill();
    }
    const flicker = lt < 0.5 ? (rnd() > 0.35 ? 1 : 0.4) : 1;
    const k = seg01(lt, 0, 0.6);
    drawLogoMark(ctx, rc, W / 2, 440, 210, k * flicker, lerp(0.9, 1, ease.outCubic(k)));
    brandLines(ctx, rc, lt, 650, 0.25, 0.5);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 0; i < 40; i++) ctx.fillRect(rnd() * W, 70 + rnd() * (H - 140), 2, 2);
  }
}

function introStripes(ctx: Ctx2D, rc: RenderContext, t: number, _dur: number) {
  const b = rc.project.style.brand;
  radialBackground(ctx, b.background, b.secondary, 0.12);
  // Content underneath
  const ck = seg01(t, 0.85, 0.6);
  drawLogoMark(ctx, rc, W / 2, 420, 230, clamp01(ck * 2), lerp(0.6, 1, ease.outBack(ck)));
  brandLines(ctx, rc, t, 660, 1.0, 1.3, 92);
  // Stripes sweeping across
  const colors = [b.primary, b.secondary, shade(b.primary, -0.35), "#F4EFE8", b.primary, shade(b.secondary, -0.3)];
  const sw = 420;
  const skew = 380;
  for (let i = 0; i < colors.length; i++) {
    const k = seg01(t, i * 0.06, 1.15);
    if (k <= 0 || k >= 1) continue;
    const x = lerp(-W - sw - skew, W + skew, ease.inOutCubic(k)) + i * (sw * 0.62);
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(x + skew, 0);
    ctx.lineTo(x + skew + sw, 0);
    ctx.lineTo(x + sw, H);
    ctx.lineTo(x, H);
    ctx.closePath();
    ctx.fill();
  }
}

function introLineDraw(ctx: Ctx2D, rc: RenderContext, t: number, _dur: number) {
  const b = rc.project.style.brand;
  ctx.fillStyle = b.background;
  ctx.fillRect(0, 0, W, H);
  const lw = 1100 * ease.outExpo(seg01(t, 0.1, 0.9));
  const ly = 560;
  ctx.fillStyle = b.primary;
  ctx.fillRect(W / 2 - lw / 2, ly - 2, lw, 4);
  // Brand name rises out of the line, clipped above it.
  const nk = ease.outCubic(seg01(t, 0.55, 0.8));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, ly - 6);
  ctx.clip();
  drawText(ctx, b.name, st({ fontSize: 112, fontWeight: 900, letterSpacing: 10 }), rc.scale, W / 2, ly - 80 + (1 - nk) * 150);
  ctx.restore();
  if (b.slogan) {
    drawText(ctx, b.slogan, st({ fontSize: 36, fontWeight: 400, color: "#D9D2CC", letterSpacing: 10 }), rc.scale, W / 2, ly + 62, {
      local: t - 1.05,
      dur: 999,
      anim: { in: "spread", out: "none", inDur: 0.9, outDur: 0 },
      opacity: t > 1.05 ? 1 : 0,
    });
  }
  const lk = seg01(t, 1.3, 0.6);
  drawLogoMark(ctx, rc, W / 2, 300, 130, lk, lerp(0.85, 1, ease.outCubic(lk)));
}

function introParticles(ctx: Ctx2D, rc: RenderContext, t: number, _dur: number) {
  const b = rc.project.style.brand;
  radialBackground(ctx, b.background, b.primary, 0.16);
  const rnd = mulberry32(42);
  const n = 150;
  const cx = W / 2;
  const cy = 450;
  const R = 230;
  const spin = Math.max(0, t - 1.7) * 0.35;
  const palette = [b.primary, b.secondary, "#FFFFFF"];
  for (let i = 0; i < n; i++) {
    const sx = rnd() * W * 1.4 - W * 0.2;
    const sy = rnd() * H * 1.4 - H * 0.2;
    const delay = rnd() * 0.55;
    const size = 2 + rnd() * 5;
    const color = palette[Math.floor(rnd() * 3)];
    const k = ease.outCubic(seg01(t, delay, 1.25));
    const ang = (i / n) * Math.PI * 2 + spin;
    const tx = cx + Math.cos(ang) * R;
    const ty = cy + Math.sin(ang) * R;
    ctx.fillStyle = rgba(color, 0.25 + 0.75 * k);
    ctx.fillRect(lerp(sx, tx, k) - size / 2, lerp(sy, ty, k) - size / 2, size, size);
  }
  const gk = seg01(t, 1.55, 0.5);
  if (gk > 0) {
    ctx.save();
    ctx.shadowColor = b.primary;
    ctx.shadowBlur = 40 * rc.scale;
    ctx.strokeStyle = rgba(b.primary, gk);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const lk = seg01(t, 1.6, 0.6);
  drawLogoMark(ctx, rc, cx, cy, 220, lk, lerp(0.5, 1, ease.outBack(lk)));
  if (t > 1.6) {
    const flash = 1 - seg01(t, 1.6, 0.35);
    ctx.fillStyle = `rgba(255,255,255,${flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
  brandLines(ctx, rc, t, 800, 1.85, 2.15, 76);
}

/* ================================================================== */
/* Outros                                                              */
/* ================================================================== */

export function drawOutro(ctx: Ctx2D, rc: RenderContext, t: number, dur: number) {
  const b = rc.project.style.brand;
  switch (b.outro.template) {
    case "follow":
      outroFollow(ctx, rc, t, dur);
      break;
    case "iris-close":
      outroIris(ctx, rc, t, dur);
      return;
    case "credits":
      outroCredits(ctx, rc, t, dur);
      break;
    default:
      outroThanks(ctx, rc, t, dur);
  }
  // Fade to black at the very end.
  const fk = seg01(t, dur - 0.8, 0.8);
  if (fk > 0) {
    ctx.fillStyle = `rgba(0,0,0,${ease.inQuad(fk)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function outroThanks(ctx: Ctx2D, rc: RenderContext, t: number, _dur: number) {
  const b = rc.project.style.brand;
  radialBackground(ctx, b.background, b.primary, 0.14);
  const lk = seg01(t, 0.1, 0.6);
  drawLogoMark(ctx, rc, W / 2, 330, 140, lk, lerp(0.8, 1, ease.outCubic(lk)));
  drawText(ctx, b.outro.title, st({ fontSize: 124, fontWeight: 900, letterSpacing: 6 }), rc.scale, W / 2, 520, {
    local: t - 0.3,
    dur: 999,
    anim: { in: "pop", out: "none", inDur: 0.7, outDur: 0 },
    opacity: t > 0.3 ? 1 : 0,
  });
  const lw = 220 * ease.outExpo(seg01(t, 0.7, 0.7));
  ctx.fillStyle = b.primary;
  ctx.fillRect(W / 2 - lw / 2, 616, lw, 5);
  drawText(ctx, b.outro.subtitle, st({ fontSize: 42, fontWeight: 400, color: "#E6DED6", letterSpacing: 4 }), rc.scale, W / 2, 690, {
    local: t - 0.8,
    dur: 999,
    anim: { in: "rise", out: "none", inDur: 0.6, outDur: 0 },
    opacity: t > 0.8 ? 1 : 0,
  });
  drawText(ctx, b.name, st({ fontSize: 30, fontWeight: 700, color: "#9C928A", letterSpacing: 8 }), rc.scale, W / 2, 970, {
    opacity: seg01(t, 1.1, 0.6),
  });
}

function outroFollow(ctx: Ctx2D, rc: RenderContext, t: number, _dur: number) {
  const b = rc.project.style.brand;
  ctx.fillStyle = b.background;
  ctx.fillRect(0, 0, W, H);
  const pw = 760;
  const px = lerp(-pw, 0, ease.outCubic(seg01(t, 0, 0.65)));
  ctx.fillStyle = b.primary;
  ctx.fillRect(px, 0, pw, H);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let i = 0; i < 6; i++) ctx.fillRect(px + 60 + i * 110, 0, 2, H);
  const lk = seg01(t, 0.4, 0.6);
  drawLogoMark(ctx, rc, px + pw / 2, H / 2, 300, lk, lerp(0.6, 1, ease.outBack(lk)));
  const x0 = 880;
  drawText(ctx, b.outro.title, st({ fontSize: 112, fontWeight: 900, align: "left" }), rc.scale, x0, 420, {
    local: t - 0.6,
    dur: 999,
    anim: { in: "slide-right", out: "none", inDur: 0.6, outDur: 0 },
    opacity: t > 0.6 ? 1 : 0,
  });
  drawText(ctx, b.name, st({ fontSize: 56, fontWeight: 700, color: b.secondary, align: "left" }), rc.scale, x0, 545, {
    local: t - 0.8,
    dur: 999,
    anim: { in: "rise", out: "none", inDur: 0.5, outDur: 0 },
    opacity: t > 0.8 ? 1 : 0,
  });
  drawText(ctx, b.outro.subtitle, st({ fontSize: 38, fontWeight: 400, color: "#D9D2CC", align: "left" }), rc.scale, x0, 630, {
    opacity: seg01(t, 1.0, 0.5),
  });
  ["点赞", "关注", "分享"].forEach((label, i) => {
    const at = 1.25 + i * 0.15;
    drawText(ctx, label, st({ preset: "pill", fontSize: 40, accent: i === 1 ? b.primary : "#3A332E", align: "left" }), rc.scale, x0 + i * 190, 760, {
      local: t - at,
      dur: 999,
      anim: { in: "pop", out: "none", inDur: 0.45, outDur: 0 },
      opacity: t > at ? 1 : 0,
    });
  });
}

function outroIris(ctx: Ctx2D, rc: RenderContext, t: number, dur: number) {
  const b = rc.project.style.brand;
  drawBlurBackdrop(ctx, rc.layout.firstAssetId ? rc.sources.blur(rc.layout.firstAssetId) : null, b.background, 0.55);
  const lk = seg01(t, 0.15, 0.6);
  drawLogoMark(ctx, rc, W / 2, 440, 220, lk, lerp(0.6, 1, ease.outBack(lk)));
  drawText(ctx, b.outro.title, st({ fontSize: 96, fontWeight: 900, letterSpacing: 6 }), rc.scale, W / 2, 660, {
    local: t - 0.45,
    dur: 999,
    anim: { in: "rise", out: "none", inDur: 0.6, outDur: 0 },
    opacity: t > 0.45 ? 1 : 0,
  });
  drawText(ctx, b.outro.subtitle, st({ fontSize: 38, fontWeight: 400, color: "#E6DED6" }), rc.scale, W / 2, 750, {
    opacity: seg01(t, 0.8, 0.5),
  });
  const closeStart = dur * 0.55;
  const k = ease.inOutCubic(seg01(t, closeStart, dur - closeStart - 0.15));
  if (k > 0) {
    const r = lerp(Math.hypot(W, H) * 0.6, 0, k);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(W / 2, 440, Math.max(0.01, r), 0, Math.PI * 2, true);
    ctx.fillStyle = "#000";
    ctx.fill("evenodd");
    ctx.restore();
  }
}

function outroCredits(ctx: Ctx2D, rc: RenderContext, t: number, dur: number) {
  const p = rc.project;
  const b = p.style.brand;
  ctx.fillStyle = "#0B0908";
  ctx.fillRect(0, 0, W, H);
  const lines: { text: string; size: number; color: string; weight: number }[] = [
    { text: b.outro.title, size: 84, color: "#FFFFFF", weight: 900 },
    { text: "", size: 40, color: "", weight: 400 },
    { text: p.title.title, size: 48, color: b.secondary, weight: 700 },
    { text: p.title.subtitle, size: 34, color: "#B8AEA5", weight: 400 },
    { text: "", size: 40, color: "", weight: 400 },
    ...p.groups.filter((g) => g.name.trim()).map((g) => ({ text: g.name, size: 36, color: "#E6DED6", weight: 400 })),
    { text: "", size: 40, color: "", weight: 400 },
    { text: `出品 · ${b.name}`, size: 36, color: "#E6DED6", weight: 700 },
    { text: b.outro.subtitle, size: 32, color: "#9C928A", weight: 400 },
  ];
  const gap = 1.7;
  const total = lines.reduce((a, l) => a + l.size * gap, 0);
  const scrollEnd = dur * 0.68;
  const k = clamp01(t / scrollEnd);
  let y = lerp(H + 60, -total - 40, k);
  for (const l of lines) {
    y += (l.size * gap) / 2;
    if (l.text && y > -100 && y < H + 100) {
      drawText(ctx, l.text, st({ fontSize: l.size, fontWeight: l.weight, color: l.color }), rc.scale, W / 2, y);
    }
    y += (l.size * gap) / 2;
  }
  const ek = seg01(t, dur * 0.58, 0.7);
  if (ek > 0) {
    drawLogoMark(ctx, rc, W / 2, 470, 170, ek, lerp(0.85, 1, ease.outCubic(ek)));
    drawText(ctx, b.name, st({ fontSize: 54, fontWeight: 900, letterSpacing: 6 }), rc.scale, W / 2, 640, { opacity: ek });
  }
}

/* ================================================================== */
/* Theme title                                                         */
/* ================================================================== */

export function drawTitle(ctx: Ctx2D, rc: RenderContext, t: number, dur: number) {
  const p = rc.project;
  const ts = p.style.title;
  // Background
  if (ts.background === "blur-first") {
    const blur = rc.layout.firstAssetId ? rc.sources.blur(rc.layout.firstAssetId) : null;
    drawBlurBackdrop(ctx, blur, ts.bgColor, 0.42, lerp(1.08, 1.16, clamp01(t / Math.max(0.1, dur))));
    vignette(ctx, 0.5);
  } else if (ts.background === "gradient") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, ts.bgColor);
    g.addColorStop(1, shade(ts.accent, -0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    vignette(ctx, 0.35);
  } else {
    ctx.fillStyle = ts.bgColor;
    ctx.fillRect(0, 0, W, H);
  }

  const title = p.title.title;
  const sub = p.title.subtitle;
  const tStyle = st({ fontId: ts.fontId, fontSize: ts.titleSize, fontWeight: 900, color: ts.color, accent: ts.accent });
  const sStyle = st({ fontId: ts.fontId, fontSize: ts.subtitleSize, fontWeight: 400, color: "#ECE6DF", letterSpacing: 4 });
  const sc = rc.scale;

  switch (ts.template) {
    case "split-line": {
      const lw = 1100 * ease.outExpo(seg01(t, 0.05, 0.8));
      ctx.fillStyle = ts.accent;
      ctx.fillRect(W / 2 - lw / 2, 392, lw, 4);
      ctx.fillRect(W / 2 - lw / 2, 640, lw, 4);
      const k = ease.outCubic(seg01(t, 0.35, 0.7));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 398, W, 238);
      ctx.clip();
      drawText(ctx, title, tStyle, sc, W / 2, 516 + (1 - k) * 220);
      ctx.restore();
      drawText(ctx, sub, sStyle, sc, W / 2, 712, { local: t - 0.8, dur: 999, anim: { in: "fade", out: "none", inDur: 0.6, outDur: 0 }, opacity: t > 0.8 ? 1 : 0 });
      break;
    }
    case "stack-left": {
      const x = 190;
      const bh = 380 * ease.outCubic(seg01(t, 0, 0.6));
      ctx.fillStyle = ts.accent;
      ctx.fillRect(150, 540 - bh / 2, 12, bh);
      drawText(ctx, p.style.brand.name.toUpperCase(), st({ fontSize: 30, fontWeight: 700, color: ts.accent, letterSpacing: 8, align: "left" }), sc, x, 390, {
        opacity: seg01(t, 0.25, 0.4),
      });
      drawText(ctx, title, { ...tStyle, align: "left" }, sc, x, 505, {
        local: t - 0.3,
        dur: 999,
        anim: { in: "slide-left", out: "none", inDur: 0.7, outDur: 0 },
        opacity: t > 0.3 ? 1 : 0,
      });
      drawText(ctx, sub, { ...sStyle, align: "left" }, sc, x, 632, {
        local: t - 0.65,
        dur: 999,
        anim: { in: "rise", out: "none", inDur: 0.6, outDur: 0 },
        opacity: t > 0.65 ? 1 : 0,
      });
      break;
    }
    case "cinema": {
      const bar = 138 * ease.outCubic(seg01(t, 0, 0.8));
      drawText(ctx, title, { ...tStyle, letterSpacing: 18 }, sc, W / 2, 515, {
        local: t - 0.3,
        dur: 999,
        anim: { in: "spread", out: "none", inDur: 1.1, outDur: 0 },
        opacity: t > 0.3 ? 1 : 0,
      });
      drawText(ctx, sub, { ...sStyle, letterSpacing: 10, fontSize: ts.subtitleSize * 0.85 }, sc, W / 2, 625, {
        opacity: seg01(t, 0.9, 0.6),
      });
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      break;
    }
    case "typewriter": {
      const n = [...title].length;
      const typeDur = Math.max(0.4, n * 0.09);
      const bmp = getTextBitmap(title, { ...tStyle, align: "left" }, sc);
      const x = W / 2 - bmp.boxW / 2;
      const k = seg01(t, 0.15, typeDur);
      drawTextBlock(ctx, bmp, x, 500, "left", t - 0.15, 999, { in: "typewriter", out: "none", inDur: typeDur, outDur: 0 }, t > 0.15 ? 1 : 0);
      // Cursor
      const visible = Math.floor(k * n);
      const frac = n ? visible / n : 1;
      const blink = Math.floor(t * 2.5) % 2 === 0 || k < 1;
      if (blink) {
        ctx.fillStyle = ts.accent;
        ctx.fillRect(x + bmp.boxW * frac + 8, 500 - ts.titleSize * 0.5, ts.titleSize * 0.08, ts.titleSize);
      }
      drawText(ctx, sub, sStyle, sc, W / 2, 630, { opacity: seg01(t, 0.25 + typeDur, 0.5) });
      break;
    }
    case "mask": {
      const tb = getTextBitmap(title, tStyle, sc);
      const tw = tb.boxW + 60;
      const tx = W / 2 - tw / 2;
      maskReveal(ctx, t, 0.05, tx, 500 - tb.boxH / 2 - 10, tw, tb.boxH + 20, ts.accent, () => drawTextBlock(ctx, tb, W / 2, 500, "center", 999, 0, null));
      const sb = getTextBitmap(sub, sStyle, sc);
      const sw = sb.boxW + 40;
      maskReveal(ctx, t, 0.35, W / 2 - sw / 2, 625 - sb.boxH / 2 - 6, sw, sb.boxH + 12, p.style.brand.secondary, () =>
        drawTextBlock(ctx, sb, W / 2, 625, "center", 999, 0, null),
      );
      break;
    }
    default: {
      const k = seg01(t, 0.1, 0.9);
      const drift = lerp(1, 1.03, clamp01(t / Math.max(0.1, dur)));
      ctx.save();
      ctx.translate(W / 2, 490);
      ctx.scale(drift * lerp(1.08, 1, ease.outCubic(k)), drift * lerp(1.08, 1, ease.outCubic(k)));
      ctx.translate(-W / 2, -490);
      drawText(ctx, title, tStyle, sc, W / 2, 490, { opacity: ease.outQuad(k) });
      ctx.restore();
      const lw = 140 * ease.outExpo(seg01(t, 0.4, 0.7));
      ctx.fillStyle = ts.accent;
      ctx.fillRect(W / 2 - lw / 2, 578, lw, 5);
      drawText(ctx, sub, sStyle, sc, W / 2, 646, {
        local: t - 0.5,
        dur: 999,
        anim: { in: "rise", out: "none", inDur: 0.6, outDur: 0 },
        opacity: t > 0.5 ? 1 : 0,
      });
    }
  }
}

function maskReveal(
  ctx: Ctx2D,
  t: number,
  at: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  drawContent: () => void,
) {
  const grow = ease.inOutCubic(seg01(t, at, 0.45));
  const shrink = ease.inOutCubic(seg01(t, at + 0.45, 0.45));
  if (shrink > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 40, y - 40, (w + 80) * 1, h + 80);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(x - 40, y - 40, 40 + w * shrink, h + 80);
    ctx.clip();
    drawContent();
    ctx.restore();
  }
  const left = x + w * shrink;
  const right = x + w * grow;
  if (right - left > 0.5) {
    ctx.fillStyle = color;
    ctx.fillRect(left, y, right - left, h);
  }
}
