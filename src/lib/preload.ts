import type { Project } from "@/types/project";
import { loadFontsForTexts } from "@/lib/fonts";

type Task = { fontId: string; weight: number; text: string };

/**
 * Every text that can appear in the video, batched so the UI stays responsive
 * while CJK glyph slices download.
 */
export function buildFontTasks(p: Project): Task[][] {
  const s = p.style;
  const b = s.brand;
  const groups = p.groups.map((g) => g.name).join("");
  const batch1: Task[] = [
    { fontId: "noto-sans", weight: 900, text: `${b.name}${b.outro.title}${p.title.title}` },
    { fontId: "noto-sans", weight: 400, text: `${b.slogan}${b.outro.subtitle}${p.title.subtitle}感谢观看点赞关注分享出品 · ` },
    { fontId: "bebas", weight: 400, text: "321" },
  ];
  const batch2: Task[] = [
    { fontId: s.title.fontId, weight: 900, text: p.title.title + b.name },
    { fontId: s.title.fontId, weight: 400, text: p.title.subtitle },
    { fontId: s.caption.style.fontId, weight: s.caption.style.fontWeight, text: groups },
    { fontId: s.subtitleTop.style.fontId, weight: s.subtitleTop.style.fontWeight, text: p.subtitles.top.map((c) => c.text).join("") },
    { fontId: s.subtitleBottom.style.fontId, weight: s.subtitleBottom.style.fontWeight, text: p.subtitles.bottom.map((c) => c.text).join("") },
  ];
  const batch3: Task[] = p.texts.map((t) => ({ fontId: t.style.fontId, weight: t.style.fontWeight, text: t.text }));
  return [batch1, batch2, batch3].filter((b2) => b2.some((t) => t.text.trim()));
}

export async function preloadProjectFonts(tasks: Task[]) {
  try {
    await loadFontsForTexts(tasks);
  } catch {
    // Missing fonts fall back gracefully.
  }
}
