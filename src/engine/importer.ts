import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import type { AssetKind, AssetMeta } from "@/types/project";
import { putAsset, type BlobVariant } from "@/db";
import { BLUR_MAX, PEAKS_PER_SECOND, PROXY_MAX, THUMB_MAX, uid } from "@/lib/util";

export class ImportError extends Error {}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i;

export function detectKind(file: File): AssetKind | null {
  const t = file.type;
  if (t.startsWith("image/") || IMAGE_EXT.test(file.name)) return "image";
  if (t.startsWith("video/") || VIDEO_EXT.test(file.name)) return "video";
  if (t.startsWith("audio/") || AUDIO_EXT.test(file.name)) return "audio";
  return null;
}

/** Import a file: probe it, build preview variants and store everything in IndexedDB. */
export async function importFile(file: File, forceKind?: AssetKind): Promise<AssetMeta> {
  const kind = forceKind ?? detectKind(file);
  if (!kind) throw new ImportError(`不支持的文件类型：${file.name}`);
  if (/\.(heic|heif)$/i.test(file.name)) throw new ImportError(`浏览器无法解码 HEIC：${file.name}，请先转成 JPG`);
  const id = uid("a");
  const base: AssetMeta = {
    id,
    kind,
    name: file.name.replace(/\.[^.]+$/, ""),
    mime: file.type || "application/octet-stream",
    size: file.size,
    width: 0,
    height: 0,
    duration: 0,
    hasAudio: false,
    createdAt: Date.now(),
  };
  if (kind === "image") return importImage(file, base);
  if (kind === "video") return importVideo(file, base);
  return importAudio(file, base);
}

/* Images --------------------------------------------------------- */

async function decodeImage(file: Blob, isSvg: boolean): Promise<ImageBitmap> {
  if (!isSvg) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img> decoding
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    let w = img.naturalWidth || 1024;
    let h = img.naturalHeight || 1024;
    if (isSvg) {
      // Rasterize vector logos at a generous size.
      const k = 2048 / Math.max(w, h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await createImageBitmap(c);
  } catch {
    throw new ImportError("图片解码失败，文件可能已损坏或格式不受支持");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitSize(w: number, h: number, max: number) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

async function renderVariant(src: CanvasImageSource, sw: number, sh: number, max: number, quality = 0.86): Promise<Blob> {
  const { w, h } = fitSize(sw, sh, max);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return c.convertToBlob({ type: "image/webp", quality });
}

async function renderBlur(src: CanvasImageSource, sw: number, sh: number): Promise<Blob> {
  const { w, h } = fitSize(sw, sh, BLUR_MAX);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.filter = `blur(${Math.max(2, Math.round(w / 40))}px) saturate(1.15)`;
  // Draw slightly larger so blurred edges stay opaque.
  const pad = w * 0.08;
  ctx.drawImage(src, -pad, -pad * (h / w), w + pad * 2, h + pad * 2 * (h / w));
  return c.convertToBlob({ type: "image/webp", quality: 0.8 });
}

async function importImage(file: File, meta: AssetMeta): Promise<AssetMeta> {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  const bmp = await decodeImage(file, isSvg);
  try {
    meta.width = bmp.width;
    meta.height = bmp.height;
    const blobs: Partial<Record<BlobVariant, Blob>> = {
      orig: file,
      proxy: await renderVariant(bmp, bmp.width, bmp.height, PROXY_MAX),
      thumb: await renderVariant(bmp, bmp.width, bmp.height, THUMB_MAX, 0.8),
      blur: await renderBlur(bmp, bmp.width, bmp.height),
    };
    if (isSvg) {
      // Export decodes "orig" with createImageBitmap, which cannot read SVG.
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      blobs.orig = await c.convertToBlob({ type: "image/png" });
      meta.mime = "image/png";
    }
    await putAsset(meta, blobs);
    return meta;
  } finally {
    bmp.close();
  }
}

/* Video ---------------------------------------------------------- */

async function probeVideo(file: File) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) throw new ImportError(`文件中没有视频轨：${file.name}`);
    const at = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    const canDecode = await vt.canDecode();
    return {
      width: vt.displayWidth,
      height: vt.displayHeight,
      duration,
      hasAudio: !!at && (await at.canDecode()),
      canDecode,
    };
  } finally {
    input.dispose();
  }
}

function waitEvent(el: HTMLMediaElement, ev: string, timeout = 15000) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new ImportError("视频加载超时"));
    }, timeout);
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new ImportError("浏览器无法播放该视频格式"));
    };
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(ev, ok);
      el.removeEventListener("error", fail);
    };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}

async function grabPoster(file: File, at: number): Promise<{ bmp: ImageBitmap; w: number; h: number; duration: number }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await waitEvent(v, "loadeddata");
    const target = Math.min(at, Math.max(0, (v.duration || 1) * 0.3));
    if (target > 0.05) {
      v.currentTime = target;
      await waitEvent(v, "seeked");
    }
    const bmp = await createImageBitmap(v);
    return { bmp, w: v.videoWidth, h: v.videoHeight, duration: v.duration };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

async function importVideo(file: File, meta: AssetMeta): Promise<AssetMeta> {
  let probe: Awaited<ReturnType<typeof probeVideo>> | null = null;
  try {
    probe = await probeVideo(file);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    probe = null; // Container not understood by Mediabunny, try the media element.
  }
  const poster = await grabPoster(file, 1);
  try {
    meta.width = probe?.width || poster.w;
    meta.height = probe?.height || poster.h;
    meta.duration = probe?.duration || poster.duration || 0;
    meta.hasAudio = probe?.hasAudio ?? false;
    if (probe && !probe.canDecode) {
      throw new ImportError(`该视频编码无法在浏览器中解码导出（建议转为 H.264 MP4）：${file.name}`);
    }
    const blobs: Partial<Record<BlobVariant, Blob>> = {
      orig: file,
      proxy: await renderVariant(poster.bmp, poster.w, poster.h, PROXY_MAX),
      thumb: await renderVariant(poster.bmp, poster.w, poster.h, THUMB_MAX, 0.8),
      blur: await renderBlur(poster.bmp, poster.w, poster.h),
    };
    await putAsset(meta, blobs);
    return meta;
  } finally {
    poster.bmp.close();
  }
}

/* Audio ---------------------------------------------------------- */

export function computePeaks(buffer: AudioBuffer, perSecond = PEAKS_PER_SECOND): number[] {
  const n = Math.max(1, Math.ceil(buffer.duration * perSecond));
  const len = buffer.length;
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const peaks = new Array<number>(n).fill(0);
  const step = len / n;
  let max = 0.0001;
  for (let i = 0; i < n; i++) {
    const s0 = Math.floor(i * step);
    const s1 = Math.min(len, Math.floor((i + 1) * step));
    let m = 0;
    // Sub-sample for speed; peaks only need to look right.
    const stride = Math.max(1, Math.floor((s1 - s0) / 256));
    for (const ch of chans) {
      for (let s = s0; s < s1; s += stride) {
        const v = Math.abs(ch[s]);
        if (v > m) m = v;
      }
    }
    peaks[i] = m;
    if (m > max) max = m;
  }
  return peaks.map((p) => Math.round((p / max) * 1000) / 1000);
}

async function importAudio(file: File, meta: AssetMeta): Promise<AssetMeta> {
  const buf = await file.arrayBuffer();
  let decoded: AudioBuffer;
  try {
    decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf);
  } catch {
    throw new ImportError(`音频解码失败：${file.name}`);
  }
  meta.duration = decoded.duration;
  meta.hasAudio = true;
  meta.peaks = computePeaks(decoded);
  await putAsset(meta, { orig: file });
  return meta;
}

/** Fetch a URL (bundled sample) and import it as an asset. */
export async function importFromUrl(url: string, name: string, kind?: AssetKind): Promise<AssetMeta> {
  const res = await fetch(url);
  if (!res.ok) throw new ImportError(`下载失败：${url}`);
  const blob = await res.blob();
  const file = new File([blob], name, { type: blob.type });
  return importFile(file, kind);
}
