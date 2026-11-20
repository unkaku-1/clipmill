import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
  type VideoCodec,
  type VideoSample,
} from "mediabunny";
import type { AssetMeta, ID, Project } from "@/types/project";
import type { Drawable, FrameSources, RenderContext } from "@/engine/draw";
import { activeSegments, computeLayout, type Layout, type Segment } from "@/engine/timeline";
import { musicFadeEnd, musicWindow } from "@/engine/music";
import { renderFrame } from "@/engine/render";
import { clearTextCache } from "@/engine/text";
import { loadOriginal } from "@/engine/sources";
import { getBlob } from "@/db";
import { loadFontsForTexts } from "@/lib/fonts";
import { DESIGN_W, FPS, sleep } from "@/lib/util";

export type ResolutionId = "1080p" | "4k";
export type QualityId = "standard" | "high" | "max";

export const RESOLUTIONS: Record<ResolutionId, { w: number; h: number; label: string }> = {
  "1080p": { w: 1920, h: 1080, label: "1080P（1920×1080）" },
  "4k": { w: 3840, h: 2160, label: "4K（3840×2160）" },
};

export const BITRATES: Record<ResolutionId, Record<QualityId, number>> = {
  "1080p": { standard: 12e6, high: 20e6, max: 32e6 },
  "4k": { standard: 40e6, high: 60e6, max: 90e6 },
};

export const CODEC_LABEL: Record<string, string> = {
  avc: "H.264 / AVC（兼容性最好）",
  hevc: "H.265 / HEVC（体积更小）",
  av1: "AV1（新一代，编码较慢）",
  vp9: "VP9",
};

export interface CodecSupport {
  codec: VideoCodec;
  ok: boolean;
}

export async function detectVideoCodecs(res: ResolutionId, quality: QualityId): Promise<CodecSupport[]> {
  const { w, h } = RESOLUTIONS[res];
  const bitrate = BITRATES[res][quality];
  const list: VideoCodec[] = ["avc", "hevc", "av1", "vp9"];
  return Promise.all(
    list.map(async (codec) => {
      try {
        const ok = await canEncodeVideo(codec, { width: w, height: h, quality: new Quality({ bitrate }), frameRate: FPS });
        return { codec, ok };
      } catch {
        return { codec, ok: false };
      }
    }),
  );
}

export function webCodecsAvailable() {
  return typeof window !== "undefined" && "VideoEncoder" in window && window.isSecureContext;
}

export interface ExportOptions {
  resolution: ResolutionId;
  quality: QualityId;
  codec: VideoCodec;
  includeAudio: boolean;
  /** When set, stream straight to this file on disk; otherwise keep the file in memory. */
  fileHandle: FileSystemFileHandle | null;
  range?: { start: number; end: number };
}

export interface ExportProgress {
  phase: "prepare" | "audio" | "render" | "finalize" | "done";
  frame: number;
  total: number;
  fps: number;
  eta: number;
  bytes: number;
}

export interface ExportResult {
  blob: Blob | null;
  bytes: number;
  seconds: number;
}

/* ------------------------------------------------------------------ */
/* Export-time frame sources                                           */
/* ------------------------------------------------------------------ */

class VideoCursor {
  private input: Input;
  private gen: AsyncGenerator<VideoSample | null, void, unknown>;
  current: VideoSample | null = null;

  constructor(blob: Blob, timestamps: number[]) {
    this.input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const input = this.input;
    async function* run() {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return;
      const sink = new VideoSampleSink(track);
      yield* sink.samplesAtTimestamps(timestamps);
    }
    this.gen = run();
  }

  async next() {
    const r = await this.gen.next();
    const sample = r.done ? null : r.value;
    if (sample) {
      this.current?.close();
      this.current = sample;
    }
    // When null (past the end), keep showing the last decoded frame.
    return this.current;
  }

  close() {
    this.current?.close();
    this.current = null;
    void this.gen.return(undefined).catch(() => undefined);
    this.input.dispose();
  }
}

class ExportSources implements FrameSources {
  private images = new Map<ID, ImageBitmap>();
  private blurs = new Map<ID, ImageBitmap>();
  private loading = new Map<string, Promise<void>>();
  private cursors = new Map<string, VideoCursor>();
  private finished = new Set<string>();
  private videoTimestamps = new Map<string, number[]>();

  constructor(
    private project: Project,
    private layout: Layout,
    private assets: Record<ID, AssetMeta>,
    private outW: number,
    private outH: number,
    private frames: number[],
  ) {
    this.planVideoTimestamps();
  }

  image(id: ID): Drawable | null {
    const b = this.images.get(id);
    return b ? { source: b, width: b.width, height: b.height } : null;
  }

  blur(id: ID): Drawable | null {
    const b = this.blurs.get(id);
    return b ? { source: b, width: b.width, height: b.height } : null;
  }

  video(key: string): Drawable | null {
    const s = this.cursors.get(key)?.current;
    if (!s) return null;
    return { source: s.toCanvasImageSource(), width: s.displayWidth, height: s.displayHeight };
  }

  /**
   * For every video segment, list the source timestamps of exactly the frames
   * where the renderer will draw it (same activeSegments() logic as renderFrame).
   */
  private planVideoTimestamps() {
    for (const t of this.frames) {
      const { a, b } = activeSegments(this.layout, t);
      for (const s of [a, b]) {
        if (!s || !this.isVideoSeg(s)) continue;
        let list = this.videoTimestamps.get(s.key);
        if (!list) {
          list = [];
          this.videoTimestamps.set(s.key, list);
        }
        list.push(this.sourceTime(s, t));
      }
    }
  }

  private isVideoSeg(s: Segment) {
    return !!s.assetId && this.assets[s.assetId]?.kind === "video";
  }

  private sourceTime(s: Segment, t: number) {
    const asset = this.assets[s.assetId!];
    const trimIn = s.clip?.trimIn ?? 0;
    return Math.max(0, Math.min(trimIn + (t - s.start), Math.max(0, asset.duration - 0.02)));
  }

  private async loadImage(id: ID) {
    const key = `img:${id}`;
    if (this.images.has(id)) return;
    let p = this.loading.get(key);
    if (!p) {
      p = (async () => {
        const asset = this.assets[id];
        if (!asset) return;
        const isLogo = id === this.project.style.brand.logoAssetId;
        const blob = asset.kind === "video" ? await getBlob(id, "proxy") : await loadOriginal(id);
        if (!blob) return;
        let bmp: ImageBitmap;
        const k = this.outW / DESIGN_W;
        if (asset.kind === "image" && asset.width && asset.height) {
          // Decode at the size actually needed: cover the frame with Ken Burns headroom.
          const need = isLogo
            ? Math.min(1, (700 * k) / Math.max(asset.width, asset.height))
            : Math.min(1, Math.max(this.outW / asset.width, this.outH / asset.height) * 1.3);
          bmp =
            need < 0.98
              ? await createImageBitmap(blob, {
                  resizeWidth: Math.max(1, Math.round(asset.width * need)),
                  resizeHeight: Math.max(1, Math.round(asset.height * need)),
                  resizeQuality: "high",
                  imageOrientation: "from-image",
                })
              : await createImageBitmap(blob, { imageOrientation: "from-image" });
        } else {
          bmp = await createImageBitmap(blob);
        }
        this.images.set(id, bmp);
      })().finally(() => this.loading.delete(key));
      this.loading.set(key, p);
    }
    await p;
  }

  private async loadBlur(id: ID) {
    if (this.blurs.has(id)) return;
    const key = `blur:${id}`;
    let p = this.loading.get(key);
    if (!p) {
      p = (async () => {
        const blob = await getBlob(id, "blur");
        if (blob) this.blurs.set(id, await createImageBitmap(blob));
      })().finally(() => this.loading.delete(key));
      this.loading.set(key, p);
    }
    await p;
  }

  private neededAssets(t0: number, t1: number) {
    const imgs = new Set<ID>();
    const blurs = new Set<ID>();
    const logo = this.project.style.brand.logoAssetId;
    if (logo) imgs.add(logo);
    if (this.layout.firstAssetId) blurs.add(this.layout.firstAssetId);
    for (const s of this.layout.segments) {
      if (s.end < t0 || s.start > t1 || !s.assetId) continue;
      blurs.add(s.assetId);
      const a = this.assets[s.assetId];
      if (a && (a.kind === "image" || s.kind === "clip")) imgs.add(s.assetId);
    }
    return { imgs, blurs };
  }

  /** Prepare everything needed to draw time t (awaits decoding). */
  async prepare(t: number) {
    // Must-have for this frame.
    const now = this.neededAssets(t, t);
    await Promise.all([...[...now.imgs].map((id) => this.loadImage(id)), ...[...now.blurs].map((id) => this.loadBlur(id))]);

    // Look ahead in the background.
    const ahead = this.neededAssets(t, t + 2.5);
    for (const id of ahead.imgs) void this.loadImage(id).catch(() => undefined);
    for (const id of ahead.blurs) void this.loadBlur(id).catch(() => undefined);

    // Release full-resolution images that are no longer needed.
    const keep = this.neededAssets(t - 0.1, t + 3);
    for (const [id, bmp] of this.images) {
      if (!keep.imgs.has(id) && !this.loading.has(`img:${id}`)) {
        bmp.close();
        this.images.delete(id);
      }
    }

    // Advance video decoders for segments drawn at t.
    const { a, b } = activeSegments(this.layout, t);
    const drawn = new Set<string>();
    for (const s of [a, b]) {
      if (!s || !this.isVideoSeg(s) || this.finished.has(s.key)) continue;
      drawn.add(s.key);
      let cur = this.cursors.get(s.key);
      if (!cur) {
        const blob = await loadOriginal(s.assetId!);
        cur = new VideoCursor(blob, this.videoTimestamps.get(s.key) ?? []);
        this.cursors.set(s.key, cur);
      }
      await cur.next();
    }
    for (const [key, cur] of this.cursors) {
      if (!drawn.has(key)) {
        cur.close();
        this.cursors.delete(key);
        this.finished.add(key);
      }
    }
  }

  dispose() {
    for (const b of this.images.values()) b.close();
    for (const b of this.blurs.values()) b.close();
    for (const c of this.cursors.values()) c.close();
    this.images.clear();
    this.blurs.clear();
    this.cursors.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Audio mixdown                                                       */
/* ------------------------------------------------------------------ */

const SAMPLE_RATE = 48000;

async function mixAudio(project: Project, layout: Layout, assets: Record<ID, AssetMeta>, t0: number, t1: number) {
  const videoSegs = layout.segments.filter((s) => {
    const a = s.assetId ? assets[s.assetId] : null;
    if (!a || a.kind !== "video" || !a.hasAudio) return false;
    if (s.clip && (s.clip.muted || s.clip.volume <= 0)) return false;
    return s.end > t0 && s.start < t1;
  });
  // The music fades out on the frame before the outro (see engine/music.ts), so
  // a track longer than the video is never cut off mid-note.
  const fadeEnd = musicFadeEnd(layout);
  const music = project.audio.filter((c) => {
    if (!assets[c.assetId]) return false;
    const w = musicWindow(c, fadeEnd);
    return w.end > w.start && w.start < t1 && w.end > t0;
  });
  if (!music.length && !videoSegs.length) return null;

  const length = Math.max(1, Math.ceil((t1 - t0) * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);

  for (const c of music) {
    const blob = await loadOriginal(c.assetId);
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const w = musicWindow(c, fadeEnd);
    const s = w.start - t0;
    const e = w.end - t0;
    const playDur = w.end - w.start;
    g.gain.setValueAtTime(c.fadeIn > 0 ? 0 : c.volume, Math.max(0, s));
    if (c.fadeIn > 0) g.gain.linearRampToValueAtTime(c.volume, Math.max(0, s + c.fadeIn));
    if (c.fadeOut > 0) {
      g.gain.setValueAtTime(c.volume, Math.max(0, w.fadeStart - t0));
      g.gain.linearRampToValueAtTime(0, Math.max(0, e));
    }
    src.connect(g).connect(ctx.destination);
    if (s >= 0) src.start(s, c.trimIn, playDur);
    else src.start(0, c.trimIn - s, playDur + s);
  }

  for (const seg of videoSegs) {
    const blob = await loadOriginal(seg.assetId!);
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) continue;
      const sink = new AudioBufferSink(track);
      const trimIn = seg.clip?.trimIn ?? 0;
      const dur = seg.end - seg.start;
      const vol = seg.clip ? seg.clip.volume : 1;
      const g = ctx.createGain();
      const s = seg.start - t0;
      const e = seg.end - t0;
      // Short fades avoid clicks at shot boundaries.
      g.gain.setValueAtTime(0, Math.max(0, s));
      g.gain.linearRampToValueAtTime(vol, Math.max(0, s + 0.04));
      g.gain.setValueAtTime(vol, Math.max(0, e - 0.06));
      g.gain.linearRampToValueAtTime(0, Math.max(0, e));
      g.connect(ctx.destination);
      for await (const { buffer, timestamp } of sink.buffers(trimIn, trimIn + dur)) {
        const when = s + (timestamp - trimIn);
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(g);
        if (when >= 0) node.start(when);
        else if (-when < buffer.duration) node.start(0, -when);
      }
    } finally {
      input.dispose();
    }
  }
  return ctx.startRendering();
}

function sliceAudio(buf: AudioBuffer, from: number, to: number): AudioBuffer {
  const a = Math.floor(from * buf.sampleRate);
  const b = Math.min(buf.length, Math.floor(to * buf.sampleRate));
  const out = new AudioBuffer({ length: Math.max(1, b - a), numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(a, b), ch);
  return out;
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

function collectTexts(p: Project) {
  const items: { fontId: string; weight: number; text: string }[] = [];
  const s = p.style;
  const brandText = [s.brand.name, s.brand.slogan, s.brand.outro.title, s.brand.outro.subtitle, "321点赞关注分享出品 · "].join("");
  items.push({ fontId: "noto-sans", weight: 900, text: brandText + p.title.title });
  items.push({ fontId: "noto-sans", weight: 400, text: brandText + p.title.subtitle });
  items.push({ fontId: "noto-sans", weight: 700, text: brandText + p.groups.map((g) => g.name).join("") });
  items.push({ fontId: "bebas", weight: 400, text: "321" });
  items.push({ fontId: s.title.fontId, weight: 900, text: p.title.title + s.brand.name });
  items.push({ fontId: s.title.fontId, weight: 400, text: p.title.subtitle });
  items.push({ fontId: s.caption.style.fontId, weight: s.caption.style.fontWeight, text: p.groups.map((g) => g.name).join("") });
  for (const t of p.texts) items.push({ fontId: t.style.fontId, weight: t.style.fontWeight, text: t.text });
  items.push({ fontId: s.subtitleTop.style.fontId, weight: s.subtitleTop.style.fontWeight, text: p.subtitles.top.map((c) => c.text).join("") });
  items.push({ fontId: s.subtitleBottom.style.fontId, weight: s.subtitleBottom.style.fontWeight, text: p.subtitles.bottom.map((c) => c.text).join("") });
  return items;
}

export async function exportVideo(
  project: Project,
  assets: Record<ID, AssetMeta>,
  opts: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  onPreview: ((canvas: OffscreenCanvas) => void) | null,
  signal: AbortSignal,
): Promise<ExportResult> {
  const startedAt = performance.now();
  const { w, h } = RESOLUTIONS[opts.resolution];
  const layout = computeLayout(project, assets);
  const t0 = Math.max(0, opts.range?.start ?? 0);
  const t1 = Math.min(layout.duration, opts.range?.end ?? layout.duration);
  const firstFrame = Math.round(t0 * FPS);
  const lastFrame = Math.max(firstFrame + 1, Math.ceil(t1 * FPS - 1e-6));
  const frames: number[] = [];
  for (let i = firstFrame; i < lastFrame; i++) frames.push(i / FPS);
  const total = frames.length;
  let bytes = 0;
  const report = (phase: ExportProgress["phase"], frame: number, fps = 0, eta = 0) =>
    onProgress({ phase, frame, total, fps, eta, bytes });

  report("prepare", 0);
  await loadFontsForTexts(collectTexts(project));
  clearTextCache();

  // Audio first: it is fast and lets us interleave audio and video packets.
  let mixed: AudioBuffer | null = null;
  let audioCodec: AudioCodec | null = null;
  if (opts.includeAudio) {
    report("audio", 0);
    mixed = await mixAudio(project, layout, assets, t0, t1);
    if (mixed) {
      const q = new Quality({ bitrate: 192000 });
      for (const c of ["aac", "opus"] as AudioCodec[]) {
        if (await canEncodeAudio(c, { numberOfChannels: 2, sampleRate: SAMPLE_RATE, quality: q })) {
          audioCodec = c;
          break;
        }
      }
      if (!audioCodec) mixed = null;
    }
  }
  if (signal.aborted) throw new DOMException("已取消", "AbortError");

  // Output target.
  let writable: FileSystemWritableFileStream | null = null;
  let bufferTarget: BufferTarget | null = null;
  let target: StreamTarget | BufferTarget;
  if (opts.fileHandle) {
    writable = await opts.fileHandle.createWritable();
    const counting = new WritableStream<{ type: "write"; data: Uint8Array<ArrayBuffer>; position: number }>({
      async write(chunk) {
        bytes = Math.max(bytes, chunk.position + chunk.data.byteLength);
        await writable!.write({ type: "write", position: chunk.position, data: chunk.data });
      },
      async close() {
        await writable!.close();
      },
      async abort() {
        await writable!.abort();
      },
    });
    target = new StreamTarget(counting, { chunked: true, chunkSize: 16 * 1024 * 1024 });
  } else {
    bufferTarget = new BufferTarget();
    target = bufferTarget;
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: opts.fileHandle ? false : "in-memory" }),
    target,
  });

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const videoSource = new CanvasSource(canvas, {
    codec: opts.codec,
    quality: new Quality({ bitrate: BITRATES[opts.resolution][opts.quality] }),
    keyFrameInterval: 2,
    latencyMode: "quality",
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });
  let audioSource: AudioBufferSource | null = null;
  if (mixed && audioCodec) {
    audioSource = new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: 192000 }) });
    output.addAudioTrack(audioSource);
  }

  const sources = new ExportSources(project, layout, assets, w, h, frames);
  const scale = w / DESIGN_W;
  const rc: RenderContext = {
    project,
    layout,
    assets,
    sources,
    hits: null,
    scale,
    scratch: (() => {
      const pool = new Map<string, OffscreenCanvas>();
      return (id: string, sw: number, sh: number) => {
        let c = pool.get(id);
        if (!c) {
          c = new OffscreenCanvas(sw, sh);
          pool.set(id, c);
        }
        if (c.width !== sw) c.width = sw;
        if (c.height !== sh) c.height = sh;
        return c;
      };
    })(),
  };

  let finished = false;
  try {
    await output.start();
    let audioCursor = 0;
    const audioDur = t1 - t0;
    const renderStart = performance.now();
    for (let i = 0; i < total; i++) {
      if (signal.aborted) throw new DOMException("已取消", "AbortError");
      const t = frames[i];
      await sources.prepare(t);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderFrame(ctx, rc, t);
      await videoSource.add(t - t0, 1 / FPS);

      if (audioSource && mixed) {
        const want = Math.min(audioDur, (i + 1) / FPS + 1);
        while (audioCursor < want - 1e-6) {
          const next = Math.min(audioDur, audioCursor + 1);
          await audioSource.add(sliceAudio(mixed, audioCursor, next));
          audioCursor = next;
        }
      }

      if (i % 6 === 0 || i === total - 1) {
        const elapsed = (performance.now() - renderStart) / 1000;
        const fps = (i + 1) / Math.max(0.001, elapsed);
        report("render", i + 1, fps, (total - i - 1) / Math.max(0.1, fps));
      }
      if (onPreview && i % 30 === 0) onPreview(canvas);
      // Give the UI a chance to breathe.
      if (i % 3 === 0) await sleep(0);
    }
    if (audioSource && mixed) {
      while (audioCursor < audioDur - 1e-6) {
        const next = Math.min(audioDur, audioCursor + 1);
        await audioSource.add(sliceAudio(mixed, audioCursor, next));
        audioCursor = next;
      }
    }
    report("finalize", total);
    videoSource.close();
    audioSource?.close();
    await output.finalize();
    finished = true;
    const result: ExportResult = { blob: null, bytes, seconds: (performance.now() - startedAt) / 1000 };
    if (bufferTarget?.buffer) {
      result.blob = new Blob([bufferTarget.buffer], { type: "video/mp4" });
      result.bytes = bufferTarget.buffer.byteLength;
    }
    bytes = result.bytes;
    report("done", total);
    return result;
  } finally {
    sources.dispose();
    if (!finished) {
      await output.cancel().catch(() => undefined);
      if (opts.fileHandle) {
        const h = opts.fileHandle as FileSystemFileHandle & { remove?: () => Promise<void> };
        await h.remove?.().catch(() => undefined);
      }
    }
  }
}

/** Ask the user where to save the file (Chrome / Edge). Returns null if unsupported. */
export async function pickSaveFile(suggestedName: string): Promise<FileSystemFileHandle | null> {
  const w = window as Window & {
    showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
  };
  if (!w.showSaveFilePicker) return null;
  return w.showSaveFilePicker({
    suggestedName,
    types: [{ description: "MP4 视频", accept: { "video/mp4": [".mp4"] } }],
  });
}

export function canStreamToDisk() {
  return typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";
}

export function estimateSize(seconds: number, res: ResolutionId, q: QualityId) {
  return ((BITRATES[res][q] + 192000) / 8) * seconds;
}
