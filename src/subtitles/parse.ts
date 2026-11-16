import type { Cue } from "@/types/project";
import { uid } from "@/lib/util";

export interface ParsedCue {
  start: number;
  end: number;
  lines: string[];
}

export type SubtitleTarget = "top" | "bottom" | "bi-top-first" | "bi-bottom-first";

/* SRT ------------------------------------------------------------- */

function srtTime(s: string): number {
  const m = s.trim().match(/(\d+):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/);
  if (!m) return NaN;
  const ms = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000;
}

export function parseSrt(text: string): ParsedCue[] {
  const blocks = text.replace(/\r/g, "").replace(/^\uFEFF/, "").split(/\n\s*\n/);
  const out: ParsedCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->");
    const start = srtTime(a);
    const end = srtTime(b);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const body = lines
      .slice(ti + 1)
      .map((l) => l.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim())
      .filter(Boolean);
    if (!body.length) continue;
    out.push({ start, end: Math.max(end, start + 0.2), lines: body });
  }
  return out.sort((x, y) => x.start - y.start);
}

/* LRC ------------------------------------------------------------- */

const LRC_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(text: string, fallbackEnd = 0): ParsedCue[] {
  const lines = text.replace(/\r/g, "").replace(/^\uFEFF/, "").split("\n");
  let offset = 0;
  const entries: { t: number; text: string; order: number }[] = [];
  let order = 0;
  for (const raw of lines) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
    if (off) {
      offset = Number(off[1]) / 1000;
      continue;
    }
    const times: number[] = [];
    LRC_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LRC_TAG.exec(raw))) {
      const frac = m[3] ? Number(m[3]) / Math.pow(10, m[3].length) : 0;
      times.push(Number(m[1]) * 60 + Number(m[2]) + frac);
    }
    if (!times.length) continue;
    // Strip timestamps and word-level <mm:ss.xx> tags.
    const body = raw.replace(LRC_TAG, "").replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "").trim();
    for (const t of times) entries.push({ t, text: body, order: order++ });
  }
  entries.sort((a, b) => a.t - b.t || a.order - b.order);

  // Merge lines sharing a timestamp (common bilingual LRC layout).
  const merged: { t: number; lines: string[] }[] = [];
  for (const e of entries) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.t - e.t) < 0.005) {
      if (e.text) last.lines.push(e.text);
    } else {
      merged.push({ t: e.t, lines: e.text ? [e.text] : [] });
    }
  }
  const out: ParsedCue[] = [];
  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    if (!cur.lines.length) continue; // an empty line only ends the previous lyric
    const next = merged[i + 1];
    const start = Math.max(0, cur.t - offset);
    let end = next ? Math.max(0, next.t - offset) : Math.max(start + 5, fallbackEnd);
    if (end - start > 12) end = start + 12;
    out.push({ start, end: Math.max(end, start + 0.3), lines: cur.lines });
  }
  return out;
}

/* Bilingual split ------------------------------------------------- */

const SPLIT_INLINE = /\s+[/|｜]\s+/;

function cue(start: number, end: number, text: string): Cue {
  return { id: uid("s"), start, end, text };
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

/**
 * Bilingual LRC files often alternate lines: Chinese line, English line, …
 * Detect that pattern and pair each two cues into one bilingual cue.
 */
function pairAlternating(parsed: ParsedCue[]): ParsedCue[] {
  if (parsed.length < 4) return parsed;
  const single = parsed.every((p) => p.lines.length === 1 && !SPLIT_INLINE.test(p.lines[0]));
  if (!single) return parsed;
  let flips = 0;
  for (let i = 1; i < parsed.length; i++) {
    if (CJK.test(parsed[i - 1].lines[0]) !== CJK.test(parsed[i].lines[0])) flips++;
  }
  if (flips / (parsed.length - 1) < 0.8) return parsed;
  const out: ParsedCue[] = [];
  for (let i = 0; i < parsed.length; i += 2) {
    const a = parsed[i];
    const b = parsed[i + 1];
    if (!b) {
      out.push(a);
      break;
    }
    out.push({ start: a.start, end: Math.max(a.end, b.end), lines: [a.lines[0], b.lines[0]] });
  }
  return out;
}

export function distribute(parsed: ParsedCue[], target: SubtitleTarget, offset = 0): { top: Cue[]; bottom: Cue[] } {
  const top: Cue[] = [];
  const bottom: Cue[] = [];
  if (target !== "top" && target !== "bottom") parsed = pairAlternating(parsed);
  for (const p of parsed) {
    const s = Math.max(0, p.start + offset);
    const e = Math.max(s + 0.1, p.end + offset);
    if (target === "top" || target === "bottom") {
      (target === "top" ? top : bottom).push(cue(s, e, p.lines.join("\n")));
      continue;
    }
    let lines = p.lines;
    if (lines.length === 1 && SPLIT_INLINE.test(lines[0])) lines = lines[0].split(SPLIT_INLINE);
    const first = lines[0] ?? "";
    const rest = lines.slice(1).join("\n");
    const [toTop, toBottom] = target === "bi-top-first" ? [first, rest] : [rest, first];
    if (toTop) top.push(cue(s, e, toTop));
    if (toBottom) bottom.push(cue(s, e, toBottom));
  }
  return { top, bottom };
}

export function parseSubtitleFile(name: string, text: string, fallbackEnd = 0): ParsedCue[] {
  if (/\.lrc$/i.test(name) || (!/-->/.test(text) && LRC_TAG.test(text))) return parseLrc(text, fallbackEnd);
  return parseSrt(text);
}

/** Heuristic: do most cues have two lines? Then suggest bilingual mode. */
export function looksBilingual(parsed: ParsedCue[]): boolean {
  if (!parsed.length) return false;
  const multi = parsed.filter((p) => p.lines.length >= 2 || (p.lines.length === 1 && SPLIT_INLINE.test(p.lines[0]))).length;
  if (multi / parsed.length > 0.5) return true;
  return pairAlternating(parsed).some((p) => p.lines.length > 1);
}

/* Export back to SRT (handy for users) ---------------------------- */

function fmt(t: number) {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join("\n");
}
