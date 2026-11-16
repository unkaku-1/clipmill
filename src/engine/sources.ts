import type { AssetMeta, AudioClip, ID, Project } from "@/types/project";
import type { Drawable, FrameSources } from "@/engine/draw";
import type { Layout, Segment } from "@/engine/timeline";
import { getBlob } from "@/db";
import { getBlobUrl } from "@/engine/blobs";
import { clamp01 } from "@/lib/util";

interface ImageEntry {
  bmp: ImageBitmap | null;
  loading: boolean;
  failed: boolean;
  lastUse: number;
}

interface VideoSlot {
  el: HTMLVideoElement;
  assetId: ID;
  lastUse: number;
  ready: boolean;
}

interface AudioSlot {
  el: HTMLAudioElement;
  assetId: ID;
}

const IMAGE_CAPACITY = 18;
const VIDEO_CAPACITY = 5;
const PREFETCH_BEHIND = 1.5;
const PREFETCH_AHEAD = 7;

/**
 * Preview implementation of FrameSources.
 *
 * Only low-resolution proxies near the playhead are decoded (LRU bounded),
 * so a project with hundreds of photos stays light on memory. Videos play
 * through pooled <video> elements that are synchronised with the transport.
 */
export class PreviewSources implements FrameSources {
  private images = new Map<ID, ImageEntry>();
  private blurs = new Map<ID, ImageEntry>();
  private videos = new Map<string, VideoSlot>();
  private audios = new Map<ID, AudioSlot>();
  private assets: Record<ID, AssetMeta> = {};
  private playing = false;
  private clock = 0;

  constructor(private onReady: () => void) {}

  setAssets(a: Record<ID, AssetMeta>) {
    this.assets = a;
  }

  /* FrameSources -------------------------------------------------- */

  image(assetId: ID): Drawable | null {
    return this.getBitmap(this.images, assetId, "proxy");
  }

  blur(assetId: ID): Drawable | null {
    return this.getBitmap(this.blurs, assetId, "blur");
  }

  video(key: string, assetId: ID): Drawable | null {
    const slot = this.videos.get(key);
    if (!slot) {
      void this.ensureVideo(key, assetId);
      return null;
    }
    slot.lastUse = ++this.clock;
    const el = slot.el;
    if (el.readyState < 2 || !el.videoWidth) return null;
    if (!this.playing && el.seeking) return null;
    return { source: el, width: el.videoWidth, height: el.videoHeight };
  }

  /* Bitmap LRU ------------------------------------------------------ */

  private getBitmap(map: Map<ID, ImageEntry>, id: ID, variant: "proxy" | "blur"): Drawable | null {
    const e = map.get(id);
    if (e) {
      e.lastUse = ++this.clock;
      if (e.bmp) return { source: e.bmp, width: e.bmp.width, height: e.bmp.height };
      return null;
    }
    void this.load(map, id, variant);
    return null;
  }

  private async load(map: Map<ID, ImageEntry>, id: ID, variant: "proxy" | "blur") {
    if (map.has(id)) return;
    const entry: ImageEntry = { bmp: null, loading: true, failed: false, lastUse: ++this.clock };
    map.set(id, entry);
    try {
      const blob = await getBlob(id, variant);
      if (!blob) throw new Error("missing");
      const bmp = await createImageBitmap(blob);
      if (map.get(id) !== entry) {
        bmp.close();
        return;
      }
      entry.bmp = bmp;
      this.evict(map, variant === "proxy" ? IMAGE_CAPACITY : 200);
      this.onReady();
    } catch {
      entry.failed = true;
    } finally {
      entry.loading = false;
    }
  }

  private evict(map: Map<ID, ImageEntry>, capacity: number) {
    if (map.size <= capacity) return;
    const sorted = [...map.entries()].filter(([, e]) => !e.loading).sort((a, b) => a[1].lastUse - b[1].lastUse);
    while (map.size > capacity && sorted.length) {
      const [id, e] = sorted.shift()!;
      e.bmp?.close();
      map.delete(id);
    }
  }

  /** Warm the cache for shots around time t, so scrubbing and playback never wait. */
  prefetch(layout: Layout, t: number, project: Project) {
    const logo = project.style.brand.logoAssetId;
    if (logo) this.image(logo);
    if (layout.firstAssetId) this.blur(layout.firstAssetId);
    for (const s of layout.segments) {
      if (s.end < t - PREFETCH_BEHIND || s.start > t + PREFETCH_AHEAD) continue;
      if (!s.assetId) continue;
      const a = this.assets[s.assetId];
      if (!a) continue;
      this.blur(a.id);
      if (a.kind === "image" || (a.kind === "video" && s.kind === "clip")) this.image(a.id);
    }
  }

  /* Video & audio sync ------------------------------------------- */

  private async ensureVideo(key: string, assetId: ID) {
    if (this.videos.has(key)) return;
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    const slot: VideoSlot = { el, assetId, lastUse: ++this.clock, ready: false };
    this.videos.set(key, slot);
    const url = await getBlobUrl(assetId, "orig");
    if (this.videos.get(key) !== slot || !url) return;
    el.src = url;
    const ping = () => this.onReady();
    el.addEventListener("loadeddata", ping);
    el.addEventListener("seeked", ping);
    this.evictVideos();
  }

  private evictVideos() {
    if (this.videos.size <= VIDEO_CAPACITY) return;
    const sorted = [...this.videos.entries()].sort((a, b) => a[1].lastUse - b[1].lastUse);
    while (this.videos.size > VIDEO_CAPACITY && sorted.length) {
      const [key, slot] = sorted.shift()!;
      slot.el.pause();
      slot.el.removeAttribute("src");
      slot.el.load();
      this.videos.delete(key);
    }
  }

  /**
   * Called every frame (and on seek). Starts/stops pooled media elements so
   * that they match the timeline position.
   */
  sync(layout: Layout, t: number, playing: boolean, project: Project) {
    this.playing = playing;
    const active = new Set<string>();

    for (const s of layout.segments) {
      if (!s.assetId) continue;
      const a = this.assets[s.assetId];
      if (!a || a.kind !== "video") continue;
      const preroll = playing ? 1.2 : 0;
      if (t < s.start - preroll || t >= s.end) continue;
      active.add(s.key);
      this.syncVideo(s, a, t, playing);
    }
    for (const [key, slot] of this.videos) {
      if (!active.has(key) && !slot.el.paused) slot.el.pause();
    }
    this.syncAudio(project.audio, t, playing);
  }

  private syncVideo(s: Segment, a: AssetMeta, t: number, playing: boolean) {
    let slot = this.videos.get(s.key);
    if (!slot) {
      void this.ensureVideo(s.key, a.id);
      slot = this.videos.get(s.key);
      if (!slot) return;
    }
    const el = slot.el;
    if (!el.src) return;
    slot.lastUse = ++this.clock;
    const trimIn = s.clip?.trimIn ?? 0;
    const local = t - s.start;
    const target = Math.min(Math.max(0, trimIn + Math.max(0, local)), Math.max(0, (a.duration || 0) - 0.05));
    const volume = s.clip ? (s.clip.muted ? 0 : s.clip.volume) : 1;

    if (playing && local >= 0) {
      el.muted = volume <= 0 || !a.hasAudio;
      el.volume = clamp01(volume);
      if (el.paused) {
        if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
        void el.play().catch(() => undefined);
      } else if (Math.abs(el.currentTime - target) > 0.25) {
        el.currentTime = target;
      }
    } else {
      if (!el.paused) el.pause();
      el.muted = true;
      if (Math.abs(el.currentTime - target) > 1 / 120 && !el.seeking) el.currentTime = target;
    }
  }

  private syncAudio(clips: AudioClip[], t: number, playing: boolean) {
    const live = new Set<ID>();
    for (const c of clips) {
      live.add(c.id);
      let slot = this.audios.get(c.id);
      const inRange = t >= c.start && t < c.start + c.duration;
      if (!slot) {
        if (!playing || !inRange) continue;
        const el = new Audio();
        el.preload = "auto";
        slot = { el, assetId: c.assetId };
        this.audios.set(c.id, slot);
        void getBlobUrl(c.assetId, "orig").then((u) => {
          if (u) slot!.el.src = u;
        });
      }
      const el = slot.el;
      if (!el.src) continue;
      if (playing && inRange) {
        const local = t - c.start;
        const target = c.trimIn + local;
        const fin = c.fadeIn > 0 ? clamp01(local / c.fadeIn) : 1;
        const fout = c.fadeOut > 0 ? clamp01((c.duration - local) / c.fadeOut) : 1;
        el.volume = clamp01(c.volume * Math.min(fin, fout));
        if (el.paused) {
          el.currentTime = target;
          void el.play().catch(() => undefined);
        } else if (Math.abs(el.currentTime - target) > 0.2) {
          el.currentTime = target;
        }
      } else if (!el.paused) {
        el.pause();
      }
    }
    for (const [id, slot] of this.audios) {
      if (!live.has(id)) {
        slot.el.pause();
        slot.el.removeAttribute("src");
        this.audios.delete(id);
      }
    }
  }

  pauseAll() {
    this.playing = false;
    for (const s of this.videos.values()) s.el.pause();
    for (const s of this.audios.values()) s.el.pause();
  }

  /** Drop decoded bitmaps of an asset (e.g. after replacing the logo). */
  invalidate(assetId: ID) {
    for (const map of [this.images, this.blurs]) {
      const e = map.get(assetId);
      e?.bmp?.close();
      map.delete(assetId);
    }
  }

  /**
   * Release decoded resources. The instance stays usable: React StrictMode
   * mounts, unmounts and remounts effects in development, and the editor may
   * be reopened with the same instance.
   */
  dispose() {
    for (const map of [this.images, this.blurs]) {
      for (const e of map.values()) e.bmp?.close();
      map.clear();
    }
    for (const s of this.videos.values()) {
      s.el.pause();
      s.el.removeAttribute("src");
      s.el.load();
    }
    this.videos.clear();
    for (const s of this.audios.values()) {
      s.el.pause();
      s.el.removeAttribute("src");
    }
    this.audios.clear();
  }
}

/** Load the original blob of an asset (used by export). */
export async function loadOriginal(id: ID) {
  const b = await getBlob(id, "orig");
  if (!b) throw new Error(`素材缺失：${id}`);
  return b;
}
