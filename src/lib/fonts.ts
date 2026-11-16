/**
 * Fonts available for text inside the video.
 *
 * Web fonts are self-hosted through Fontsource (no Google CDN, works in
 * mainland China and offline on a NAS). CJK fonts are split into unicode-range
 * slices, so the browser downloads only the glyphs that are actually used.
 */

export interface FontDef {
  id: string;
  label: string;
  /** CSS font-family list including CJK fallback. */
  family: string;
  /** Primary family name used for document.fonts.load. */
  primary: string | null;
  weights: number[];
  sample: string;
}

const CJK_FALLBACK = `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;

export const FONTS: FontDef[] = [
  { id: "noto-sans", label: "思源黑体", family: `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`, primary: "Noto Sans SC", weights: [400, 700, 900], sample: "思源黑体" },
  { id: "noto-serif", label: "思源宋体", family: `"Noto Serif SC", "Songti SC", "SimSun", serif`, primary: "Noto Serif SC", weights: [700], sample: "思源宋体" },
  { id: "kuaile", label: "站酷快乐体", family: `"ZCOOL KuaiLe", ${CJK_FALLBACK}`, primary: "ZCOOL KuaiLe", weights: [400], sample: "快乐体" },
  { id: "qingke", label: "站酷庆科黄油体", family: `"ZCOOL QingKe HuangYou", ${CJK_FALLBACK}`, primary: "ZCOOL QingKe HuangYou", weights: [400], sample: "黄油体" },
  { id: "mashan", label: "马善政毛笔", family: `"Ma Shan Zheng", ${CJK_FALLBACK}`, primary: "Ma Shan Zheng", weights: [400], sample: "毛笔字" },
  { id: "longcang", label: "龙藏体", family: `"Long Cang", ${CJK_FALLBACK}`, primary: "Long Cang", weights: [400], sample: "龙藏体" },
  { id: "system", label: "系统黑体", family: `"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`, primary: null, weights: [400, 700], sample: "系统字体" },
  { id: "bebas", label: "Bebas Neue（英文）", family: `"Bebas Neue", ${CJK_FALLBACK}`, primary: "Bebas Neue", weights: [400], sample: "NOVEMBER" },
  { id: "playfair", label: "Playfair（英文衬线）", family: `"Playfair Display", "Noto Serif SC", serif`, primary: "Playfair Display", weights: [400, 700, 900], sample: "Autumn" },
  { id: "space", label: "Space Grotesk（英文）", family: `"Space Grotesk", ${CJK_FALLBACK}`, primary: "Space Grotesk", weights: [400, 700], sample: "Weekly" },
];

const FONT_MAP = new Map(FONTS.map((f) => [f.id, f]));

export function getFont(id: string): FontDef {
  return FONT_MAP.get(id) ?? FONTS[0];
}

export function snapWeight(font: FontDef, weight: number): number {
  let best = font.weights[0];
  for (const w of font.weights) if (Math.abs(w - weight) < Math.abs(best - weight)) best = w;
  return best;
}

export function cssFont(fontId: string, weight: number, sizePx: number): string {
  const f = getFont(fontId);
  return `${snapWeight(f, weight)} ${sizePx}px ${f.family}`;
}

/* Loading --------------------------------------------------------- */

/** Incremented whenever new glyphs finish loading; text caches key on it. */
let fontEpoch = 0;
const requested = new Set<string>();
const listeners = new Set<() => void>();

export const getFontEpoch = () => fontEpoch;

export function onFontsLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Load glyphs for a text (and its CJK fallback). Resolves when ready. */
export function loadFontFor(fontId: string, weight: number, text: string): Promise<void> {
  const f = getFont(fontId);
  const w = snapWeight(f, weight);
  const sample = text || f.sample;
  const families = new Set<string>();
  if (f.primary) families.add(f.primary);
  // CJK fallback glyphs for latin display fonts.
  if (f.family.includes("Noto Sans SC")) families.add("Noto Sans SC");
  if (f.family.includes("Noto Serif SC")) families.add("Noto Serif SC");

  const jobs: Promise<unknown>[] = [];
  for (const fam of families) {
    const fw = fam === f.primary ? w : fam === "Noto Sans SC" ? snapWeight(getFont("noto-sans"), weight) : 700;
    const descriptor = `${fw} 48px "${fam}"`;
    const key = `${descriptor}|${sample}`;
    if (requested.has(key)) continue;
    requested.add(key);
    jobs.push(
      document.fonts.load(descriptor, sample).catch(() => undefined),
    );
  }
  if (jobs.length === 0) return Promise.resolve();
  return Promise.all(jobs).then(() => {
    fontEpoch++;
    listeners.forEach((fn) => fn());
  });
}

/** Ensure many texts are loaded (used before export). */
export async function loadFontsForTexts(items: { fontId: string; weight: number; text: string }[]) {
  const byFont = new Map<string, { fontId: string; weight: number; chars: Set<string> }>();
  for (const it of items) {
    const key = `${it.fontId}|${it.weight}`;
    let entry = byFont.get(key);
    if (!entry) {
      entry = { fontId: it.fontId, weight: it.weight, chars: new Set() };
      byFont.set(key, entry);
    }
    for (const ch of it.text) entry.chars.add(ch);
  }
  await Promise.all(
    [...byFont.values()].map((e) => loadFontFor(e.fontId, e.weight, [...e.chars].join(""))),
  );
  await document.fonts.ready;
}
