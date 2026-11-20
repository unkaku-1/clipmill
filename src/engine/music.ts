import type { AudioClip } from "@/types/project";
import type { Layout } from "@/engine/timeline";

/**
 * Background music must not outlive the picture.
 *
 * A track that is longer than the video used to run to its own end: the fade-out
 * happened after the last frame, so the picture simply cut the music off
 * mid-note. The fade now finishes on the last frame *before* the outro (片尾):
 * when playback reaches the ending video the music is already silent.
 *
 * Without an outro the deadline is the end of the timeline. Pure math, no media
 * imports, so the preview, the exporter and unit checks share exactly one rule.
 */

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Timeline time at which the music bed must already be silent (音量 0). */
export function musicFadeEnd(layout: Layout): number {
  const outroStart = layout.outro ? finite(layout.outro.start) : 0;
  if (outroStart > 0) return outroStart;
  const duration = finite(layout.duration);
  return duration > 0 ? duration : 0;
}

export interface MusicWindow {
  /** First audible timeline second. */
  start: number;
  /** Timeline second where the clip is silent (exclusive). */
  end: number;
  /** Timeline second where the fade-out reaches 0. */
  fadeStart: number;
}

/**
 * Audible window of one music clip: its natural span, clipped to the fade-out
 * deadline. A clip placed after the deadline gets an empty window.
 */
export function musicWindow(clip: AudioClip, fadeEnd: number): MusicWindow {
  const start = Math.max(0, finite(clip.start));
  const naturalEnd = start + Math.max(0, finite(clip.duration));
  const deadline = finite(fadeEnd);
  const end = deadline > 0 ? Math.min(naturalEnd, Math.max(start, deadline)) : naturalEnd;
  const fade = Math.max(0, finite(clip.fadeOut));
  return { start, end, fadeStart: fade > 0 ? Math.max(start, end - fade) : end };
}

/** Gain (0..1) of one music clip at timeline time `t`; 0 outside its window. */
export function musicGain(clip: AudioClip, t: number, fadeEnd: number): number {
  const { start, end, fadeStart } = musicWindow(clip, fadeEnd);
  if (!(end > start) || !(t >= start) || t >= end) return 0;
  const volume = Number.isFinite(clip.volume) ? clamp01(clip.volume) : 1;
  const fadeIn = Math.max(0, finite(clip.fadeIn));
  const fin = fadeIn > 0 ? clamp01((t - start) / fadeIn) : 1;
  // fadeOut <= 0 means "no fade": the clip is simply cut at the deadline.
  const fadeOut = Math.max(0, finite(clip.fadeOut));
  const fout = fadeOut > 0 ? clamp01((end - t) / Math.max(1e-6, end - fadeStart)) : 1;
  return clamp01(volume * Math.min(fin, fout));
}