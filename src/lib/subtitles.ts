import { useEditor } from "@/store/editor";
import { distribute, parseSubtitleFile, type SubtitleTarget } from "@/subtitles/parse";

export async function importSubtitles(name: string, text: string, target: SubtitleTarget, replace: boolean, fallbackEnd: number) {
  const parsed = parseSubtitleFile(name, text, fallbackEnd);
  if (!parsed.length) return false;
  const { top, bottom } = distribute(parsed, target);
  useEditor.getState().update((d) => {
    if (replace) {
      d.subtitles.top = top;
      d.subtitles.bottom = bottom;
    } else {
      d.subtitles.top = [...d.subtitles.top, ...top].sort((a, b) => a.start - b.start);
      d.subtitles.bottom = [...d.subtitles.bottom, ...bottom].sort((a, b) => a.start - b.start);
    }
    if (top.length) d.style.subtitleTop.enabled = true;
    if (bottom.length) d.style.subtitleBottom.enabled = true;
  });
  return true;
}

/** Split bilingual cues that were imported as a single block. */
export function splitBilingualTrack(track: "top" | "bottom") {
  useEditor.getState().update((d) => {
    const arr = track === "top" ? d.subtitles.top : d.subtitles.bottom;
    const other = track === "top" ? d.subtitles.bottom : d.subtitles.top;
    for (const c of arr) {
      const lines = c.text.split("\n").filter(Boolean);
      if (lines.length < 2) continue;
      c.text = lines[0];
      other.push({ id: `s_${Math.random().toString(36).slice(2, 10)}`, start: c.start, end: c.end, text: lines.slice(1).join("\n") });
    }
    other.sort((a, b) => a.start - b.start);
  });
}
