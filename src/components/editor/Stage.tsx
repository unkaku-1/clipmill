import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Maximize2, Pause, Play, Repeat, SkipBack, SkipForward } from "lucide-react";
import { useEditor, useLayout, getLayout } from "@/store/editor";
import { transport } from "@/engine/transport";
import { PreviewSources } from "@/engine/sources";
import { renderFrame } from "@/engine/render";
import type { HitBox, RenderContext } from "@/engine/draw";
import { onFontsLoaded } from "@/lib/fonts";
import { DESIGN_H, DESIGN_W, FPS, clamp, formatTimecode } from "@/lib/util";
import { IconButton, Select } from "@/components/ui/controls";
import type { PreviewQuality } from "@/store/editor";

const QUALITY_H: Record<Exclude<PreviewQuality, "auto">, number> = { "540": 540, "720": 720, "1080": 1080 };
const MAX_AUTO_H = 720;
const MAX_AUTO_DPR = 1.5;

type DragKind = "logo" | "caption" | "text" | "sub-top" | "sub-bottom";

const scratchPool = new Map<string, OffscreenCanvas>();
function scratch(id: string, w: number, h: number) {
  let c = scratchPool.get(id);
  if (!c) {
    c = new OffscreenCanvas(w, h);
    scratchPool.set(id, c);
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

function sameHits(a: HitBox[], b: HitBox[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.kind !== y.kind || x.id !== y.id || Math.abs(x.x - y.x) > 0.5 || Math.abs(x.y - y.y) > 0.5 || Math.abs(x.w - y.w) > 0.5 || Math.abs(x.h - y.h) > 0.5) return false;
  }
  return true;
}

export function Stage() {
  const project = useEditor((s) => s.project)!;
  const assets = useEditor((s) => s.assets);
  const layout = useLayout()!;
  const quality = useEditor((s) => s.previewQuality);
  const setQuality = useEditor((s) => s.setPreviewQuality);
  const exporting = useEditor((s) => s.exporting);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourcesRef = useRef<PreviewSources | null>(null);
  const dirtyRef = useRef(true);
  const scaleRef = useRef(1);
  const hitsRef = useRef<HitBox[]>([]);
  const layoutRef = useRef(layout);
  const projectRef = useRef(project);
  const assetsRef = useRef(assets);
  const qualityRef = useRef(quality);
  const [box, setBox] = useState({ w: 960, h: 540 });
  const [hits, setHits] = useState<HitBox[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);

  layoutRef.current = layout;
  projectRef.current = project;
  assetsRef.current = assets;
  qualityRef.current = quality;

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  /* Sources -------------------------------------------------------- */
  if (!sourcesRef.current) sourcesRef.current = new PreviewSources(markDirty);
  const sources = sourcesRef.current;
  sources.setAssets(assets);

  /* Fit the stage --------------------------------------------------- */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const pad = 28;
      const aw = Math.max(160, r.width - pad * 2);
      const ah = Math.max(90, r.height - pad * 2);
      const aspect = DESIGN_W / DESIGN_H;
      let w = aw;
      let h = w / aspect;
      if (h > ah) {
        h = ah;
        w = h * aspect;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Render loop ------------------------------------------------------ */
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const autoH = Math.min(MAX_AUTO_H, Math.round(box.h * Math.min(dpr, MAX_AUTO_DPR)));
      const targetH = qualityRef.current === "auto" ? autoH : QUALITY_H[qualityRef.current];
      const bh = clamp(Math.round(targetH), 240, 1080);
      const bw = Math.round((bh * DESIGN_W) / DESIGN_H);
      if (canvas && (canvas.width !== bw || canvas.height !== bh)) {
        canvas.width = bw;
        canvas.height = bh;
        dirtyRef.current = true;
      }
      const ctx = canvas?.getContext("2d", { alpha: false });
      if (!ctx) return;
      const scale = bh / DESIGN_H;
      scaleRef.current = scale;
      const t = transport.time;
      sources.sync(layoutRef.current, t, transport.playing, projectRef.current);
      sources.prefetch(layoutRef.current, t, projectRef.current);
      if (dirtyRef.current || transport.playing) {
        dirtyRef.current = false;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        hitsRef.current = [];
        const rc: RenderContext = {
          project: projectRef.current,
          layout: layoutRef.current,
          assets: assetsRef.current,
          sources,
          hits: hitsRef.current,
          scale,
          scratch: scratch,
        };
        renderFrame(ctx, rc, t);
        setHits((prev) => (sameHits(prev, hitsRef.current) ? prev : hitsRef.current.slice()));
      }
    };
    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [box.w, box.h, sources]);

  useEffect(() => () => sources.dispose(), [sources]);

  useEffect(() => onFontsLoaded(markDirty), [markDirty]);
  // Seeking while paused must repaint; during playback the loop repaints anyway.
  useEffect(() => {
    const un = transport.onTime(markDirty);
    return () => {
      un();
    };
  }, [markDirty]);
  useEffect(() => {
    dirtyRef.current = true;
  }, [project, assets, layout, quality]);

  useEffect(() => {
    const un = transport.onState(() => setPlaying(transport.playing));
    return () => {
      un();
    };
  }, []);

  useEffect(() => {
    transport.loop = loop;
  }, [loop]);

  /* Dragging on the canvas ----------------------------------------- */
  const dragRef = useRef<{ kind: DragKind; id: string; offsetX: number; offsetY: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const toDesign = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * DESIGN_W, y: ((e.clientY - r.top) / r.height) * DESIGN_H };
  };

  const hitAt = (x: number, y: number) =>
    [...hits].reverse().find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toDesign(e);
    const hit = hitAt(x, y);
    if (!hit) {
      useEditor.getState().select(null);
      return;
    }
    const st = useEditor.getState();
    const anchor =
      hit.kind === "logo"
        ? { x: project.style.brand.logo.marginX, y: project.style.brand.logo.marginY }
        : hit.kind === "caption"
          ? (project.groups.find((g) => g.id === hit.id)?.captionPos ?? project.style.caption.pos)
          : hit.kind === "text"
            ? (project.texts.find((t) => t.id === hit.id)?.pos ?? { x, y })
            : hit.kind === "sub-top"
              ? { x: DESIGN_W / 2, y: project.style.subtitleTop.y }
              : { x: DESIGN_W / 2, y: project.style.subtitleBottom.y };
    dragRef.current = { kind: hit.kind as DragKind, id: hit.id, offsetX: x - anchor.x, offsetY: y - anchor.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    st.select(
      hit.kind === "logo"
        ? { kind: "logo", id: "logo" }
        : hit.kind === "caption"
          ? { kind: "caption", id: hit.id }
          : hit.kind === "text"
            ? { kind: "text", id: hit.id }
            : hit.kind === "sub-top"
              ? { kind: "sub-top", id: "sub" }
              : { kind: "sub-bottom", id: "sub" },
    );
    if (transport.playing) transport.pause();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = toDesign(e);
    const drag = dragRef.current;
    if (!drag) {
      const hit = hitAt(x, y);
      setHover(hit ? `${hit.kind}:${hit.id}` : null);
      return;
    }
    const st = useEditor.getState();
    const nx = Math.round(x - drag.offsetX);
    const ny = Math.round(y - drag.offsetY);
    if (drag.kind === "logo") {
      st.update((d) => {
        d.style.brand.logo.marginX = clamp(nx, 0, DESIGN_W - d.style.brand.logo.size);
        d.style.brand.logo.marginY = clamp(ny, 0, DESIGN_H - d.style.brand.logo.size * 0.4);
      }, { history: false });
    } else if (drag.kind === "caption") {
      st.update((d) => {
        const g = d.groups.find((x2) => x2.id === drag.id);
        if (g) g.captionPos = { x: clamp(nx, 0, DESIGN_W - 80), y: clamp(ny, 40, DESIGN_H - 30) };
      }, { history: false });
    } else if (drag.kind === "text") {
      st.update((d) => {
        const t = d.texts.find((x2) => x2.id === drag.id);
        if (t) t.pos = { x: clamp(nx, 0, DESIGN_W), y: clamp(ny, 0, DESIGN_H) };
      }, { history: false });
    } else if (drag.kind === "sub-top") {
      st.update((d) => {
        d.style.subtitleTop.y = clamp(ny, 30, DESIGN_H / 2);
      }, { history: false });
    } else if (drag.kind === "sub-bottom") {
      st.update((d) => {
        d.style.subtitleBottom.y = clamp(ny, DESIGN_H / 2, DESIGN_H - 20);
      }, { history: false });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const scale = scaleRef.current;
  const overlays = hits.filter((h) => h.w > 0 && (hover === `${h.kind}:${h.id}` || isSelected(h)));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_center,#1a1613_0%,#100e0c_70%)]">
        <div className="relative shadow-[0_30px_80px_-20px_rgba(0,0,0,.85)]" style={{ width: box.w, height: box.h }}>
          <canvas
            ref={canvasRef}
            className="block h-full w-full cursor-default rounded-[3px] bg-black"
            style={{ width: box.w, height: box.h }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              setHover(null);
              dragRef.current = null;
            }}
          />
          <div className="viewfinder pointer-events-none absolute -inset-2.5" />
          {/* Interaction overlay: outlines for draggable elements */}
          {overlays.map((h) => (
            <div
              key={`${h.kind}:${h.id}`}
              className={clsx(
                "pointer-events-none absolute rounded-[2px] border transition-colors duration-100",
                isSelected(h) ? "border-safelight" : "border-white/50",
              )}
              style={{ left: h.x * scale - 2, top: h.y * scale - 2, width: h.w * scale + 4, height: h.h * scale + 4 }}
            >
              <span className="absolute -top-5 left-0 rounded-sm bg-safelight px-1 font-mono text-[10px] whitespace-nowrap text-white">
                {LABEL[h.kind]}
                <span className="ml-1 opacity-70">拖动</span>
              </span>
            </div>
          ))}
          {exporting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="rounded-lg border border-line bg-ink-2/90 px-5 py-3 text-center">
                <div className="text-sm text-paper">正在导出，预览已暂停</div>
                <div className="mt-1 text-xs text-fog">进度见导出窗口，请保持页面在前台</div>
              </div>
            </div>
          )}
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <Select
            className="w-[112px]"
            value={quality}
            onChange={setQuality}
            options={[
              { id: "auto", label: "自适应" },
              { id: "540", label: "540P" },
              { id: "720", label: "720P" },
              { id: "1080", label: "1080P" },
            ]}
          />
        </div>
        <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[11px] text-fog/60">
          {DESIGN_W}×{DESIGN_H} · {FPS}fps
        </div>
      </div>
      <TransportBar playing={playing} loop={loop} setLoop={setLoop} />
    </div>
  );

  function isSelected(h: HitBox) {
    const sel = useEditor.getState().selection;
    if (!sel) return false;
    if (h.kind === "logo") return sel.kind === "logo";
    if (h.kind === "caption") return sel.kind === "caption" && sel.id === h.id;
    if (h.kind === "text") return sel.kind === "text" && sel.id === h.id;
    if (h.kind === "sub-top") return sel.kind === "sub-top";
    if (h.kind === "sub-bottom") return sel.kind === "sub-bottom";
    return false;
  }
}

const LABEL: Record<HitBox["kind"], string> = {
  logo: "Logo",
  caption: "分组小标题",
  text: "文字",
  "sub-top": "顶部字幕",
  "sub-bottom": "底部字幕",
};

function TransportBar({ playing, loop, setLoop }: { playing: boolean; loop: boolean; setLoop: (v: boolean) => void }) {
  const timeRef = useRef<HTMLSpanElement>(null);
  const total = useLayout()?.duration ?? 0;
  useEffect(() => {
    const un = transport.onTime((t) => {
      if (timeRef.current) timeRef.current.textContent = formatTimecode(t);
    });
    return () => {
      un();
    };
  }, []);
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-t border-line bg-ink-1 px-3">
      <IconButton label="回到开头 (Home)" onClick={() => transport.seek(0)}>
        <SkipBack size={16} />
      </IconButton>
      <IconButton label="上一帧 (←)" onClick={() => transport.step(-1)}>
        <ChevronDown size={16} className="rotate-90" />
      </IconButton>
      <button
        onClick={() => transport.toggle()}
        className="mx-1 flex h-9 w-9 items-center justify-center rounded-full bg-safelight text-white shadow-[0_0_18px_-4px_rgba(255,90,54,.8)] transition-transform hover:scale-105"
        title="播放 / 暂停 (空格)"
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <IconButton label="下一帧 (→)" onClick={() => transport.step(1)}>
        <ChevronDown size={16} className="-rotate-90" />
      </IconButton>
      <IconButton label="跳到结尾 (End)" onClick={() => transport.seek(transport.duration)}>
        <SkipForward size={16} />
      </IconButton>
      <IconButton label="循环播放" active={loop} onClick={() => setLoop(!loop)}>
        <Repeat size={15} />
      </IconButton>
      <div className="ml-3 font-mono text-[12.5px] text-paper">
        <span ref={timeRef}>{formatTimecode(transport.time)}</span>
        <span className="mx-1.5 text-fog">/</span>
        <span className="text-fog">{formatTimecode(total)}</span>
      </div>
      <div className="flex-1" />
      <span className="text-[11px] text-fog">在画面上直接拖动 Logo、小标题和字幕</span>
      <IconButton label="全屏预览" onClick={() => void (canvasFullscreen())}>
        <Maximize2 size={15} />
      </IconButton>
    </div>
  );
}

function canvasFullscreen() {
  const c = document.querySelector("canvas");
  return c?.requestFullscreen?.().catch(() => undefined);
}

/** Recompute layout for the current store (used by dialogs). */
export function currentLayout() {
  const { project, assets } = useEditor.getState();
  return project ? getLayout(project, assets) : null;
}

/** Utility used by other components to snap a time. */
export const snap = (t: number) => Math.round(t * FPS) / FPS;
