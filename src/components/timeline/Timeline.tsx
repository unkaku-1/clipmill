import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Captions, ChevronDown, ChevronUp, Layers, Magnet, Music2, Type, ZoomIn, ZoomOut } from "lucide-react";
import type { AssetMeta, AudioClip, Cue, Group, ID, Project, TextItem } from "@/types/project";
import type { Layout, Segment } from "@/engine/timeline";
import { getLayout, useEditor, useLayout } from "@/store/editor";
import { transport } from "@/engine/transport";
import { useThumb } from "@/engine/blobs";
import { moveClip, moveGroup } from "@/components/editor/actions";
import { clamp, formatTimecode, snapFrame } from "@/lib/util";
import { IconButton } from "@/components/ui/controls";

const RULER_H = 26;
const ROW_H = 44;
const HEADER_W = 132;
const MIN_PPS = 4;
const MAX_PPS = 400;
const SNAP_PX = 7;

type DragState =
  | { kind: "playhead" }
  | { kind: "clip"; clipId: ID; fromGroup: ID; fromIndex: number; grabT: number; moved: boolean; startX: number; startY: number }
  | { kind: "trim-start" | "trim-end"; clipId: ID; initial: number; initialTrim: number; segStart: number; segEnd: number; asset: AssetMeta }
  | { kind: "cue"; track: "top" | "bottom"; cueId: ID; mode: "move" | "start" | "end"; initial: Cue; grabT: number }
  | { kind: "text"; textId: ID; mode: "move" | "start" | "end"; initial: TextItem; grabT: number }
  | { kind: "audio"; audioId: ID; mode: "move" | "start" | "end"; initial: AudioClip; grabT: number };

interface SnapTargets {
  times: number[];
}

export function Timeline() {
  const project = useEditor((s) => s.project)!;
  const assets = useEditor((s) => s.assets);
  const layout = useLayout()!;
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const selection = useEditor((s) => s.selection);
  const [collapsed, setCollapsed] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<{ groupId: ID; index: number } | null>(null);
  const dropHintRef = useRef<{ groupId: ID; index: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const ppsRef = useRef(zoom);
  ppsRef.current = zoom;

  const duration = Math.max(layout.duration, 8);
  const contentW = Math.max(200, duration * zoom + 240);

  /* Rows ------------------------------------------------------------ */
  const rows = useMemo(() => {
    const list: { key: string; kind: "intro" | "title" | "group" | "text" | "sub" | "audio" | "logo"; label: string; group?: Group }[] = [];
    if (project.style.brand.intro.mode !== "none") list.push({ key: "intro", kind: "intro", label: "片头" });
    if (project.style.title.enabled) list.push({ key: "title", kind: "title", label: "主题标题" });
    for (const g of project.groups) list.push({ key: g.id, kind: "group", label: g.name || "未命名分组", group: g });
    list.push({ key: "texts", kind: "text", label: "文字 · 小标题" });
    if (project.style.subtitleTop.enabled || project.subtitles.top.length) list.push({ key: "sub-top", kind: "sub", label: "顶部字幕" });
    if (project.style.subtitleBottom.enabled || project.subtitles.bottom.length) list.push({ key: "sub-bottom", kind: "sub", label: "底部字幕" });
    if (project.audio.length || project.style.brand.outro.mode !== "none") list.push({ key: "audio", kind: "audio", label: "音乐 / 片尾" });
    list.push({ key: "logo", kind: "logo", label: "Logo 角标" });
    return list;
  }, [project]);

  /* Snap targets ---------------------------------------------------- */
  const snapTargets = useMemo<SnapTargets>(() => {
    const times = new Set<number>([0, snapFrame(layout.duration)]);
    for (const s of layout.segments) {
      times.add(s.start);
      times.add(s.end);
      times.add(s.cutIn);
      times.add(s.cutOut);
    }
    for (const c of project.subtitles.top) {
      times.add(c.start);
      times.add(c.end);
    }
    for (const c of project.subtitles.bottom) {
      times.add(c.start);
      times.add(c.end);
    }
    for (const a of project.audio) {
      times.add(a.start);
      times.add(a.start + a.duration);
    }
    for (const t of project.texts) {
      times.add(t.start);
      times.add(t.start + t.duration);
    }
    return { times: [...times] };
  }, [layout, project]);

  const snapTime = useCallback(
    (t: number, except?: Set<number>) => {
      if (!snapOn) return t;
      const pps = ppsRef.current;
      let best = t;
      let bestD = SNAP_PX / pps;
      for (const s of snapTargets.times) {
        if (except?.has(s)) continue;
        const d = Math.abs(s - t);
        if (d < bestD) {
          best = s;
          bestD = d;
        }
      }
      if (best !== t) setSnapLine(best);
      else setSnapLine(null);
      return best;
    },
    [snapOn, snapTargets],
  );

  /* Playhead: imperative updates (no React re-render while playing) */
  useEffect(() => {
    const place = (t: number) => {
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${t * ppsRef.current}px)`;
    };
    place(transport.time);
    const un = transport.onTime(place);
    return () => {
      un();
    };
  }, [zoom]);

  // Auto-scroll to keep the playhead visible during playback.
  useEffect(() => {
    const un = transport.onTime((t) => {
      if (!transport.playing) return;
      const sc = scrollRef.current;
      if (!sc) return;
      const x = t * ppsRef.current;
      const viewL = sc.scrollLeft;
      const viewR = viewL + sc.clientWidth - HEADER_W;
      if (x > viewR - 60) sc.scrollLeft = x - sc.clientWidth * 0.35;
      else if (x < viewL) sc.scrollLeft = Math.max(0, x - 60);
    });
    return () => {
      un();
    };
  }, []);

  // Ctrl+wheel zoom, shift+wheel horizontal scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - HEADER_W + el.scrollLeft;
        const t = x / ppsRef.current;
        const next = clamp(ppsRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN_PPS, MAX_PPS);
        setZoom(next);
        requestAnimationFrame(() => {
          el.scrollLeft = t * next - (e.clientX - rect.left - HEADER_W);
        });
      } else if (e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  const timeFromEvent = (clientX: number) => {
    const el = innerRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left) / ppsRef.current);
  };

  const onPlayheadDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    transport.pause();
    transport.seek(snapTime(timeFromEvent(e.clientX)));
    beginDrag({ kind: "playhead" });
  };

  const onPointerMove = (clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (!d) return;
    const t = timeFromEvent(clientX);
    if (d.kind === "playhead") {
      transport.seek(snapTime(t));
      return;
    }
    handleMove(clientX, clientY, t);
  };

  const handleMove = (clientX: number, clientY: number, t: number) => {
    const d = dragRef.current!;
    const st = useEditor.getState();
    const p = st.project!;
    const lay = getLayout(p, st.assets);
    switch (d.kind) {
      case "clip": {
        d.moved = d.moved || Math.hypot(clientX - d.startX, clientY - d.startY) > 4;
        if (!d.moved) return;
        // Find the group row under the pointer.
        const rowEls = document.querySelectorAll<HTMLElement>("[data-group-row]");
        let target: { groupId: ID; index: number } | null = null;
        for (const el of rowEls) {
          const r = el.getBoundingClientRect();
          if (clientY >= r.top && clientY <= r.bottom) {
            const gid = el.dataset.groupRow!;
            const group = p.groups.find((g) => g.id === gid);
            if (!group) continue;
            let index = 0;
            let bestD = Infinity;
            for (let i = 0; i <= group.clips.length; i++) {
              const seg = i < group.clips.length ? lay.byKey.get(group.clips[i].id) : null;
              const x = seg ? seg.cutIn * ppsRef.current : 0;
              const dd = Math.abs(x - t * ppsRef.current);
              if (dd < bestD) {
                bestD = dd;
                index = i;
              }
            }
            target = { groupId: gid, index };
          }
        }
        if (target) {
          dropHintRef.current = target;
          setDropHint(target);
        }
        break;
      }
      case "trim-start": {
        const lay2 = lay.byKey.get(d.clipId);
        if (!lay2) return;
        const shift = t - d.segStart;
        const newStart = Math.min(t, d.segEnd - 0.3);
        const actualShift = Math.max(newStart - d.segStart, -d.initialTrim);
        st.update((dd) => {
          for (const g of dd.groups) {
            const c = g.clips.find((x) => x.id === d.clipId);
            if (!c) continue;
            const isVideo = st.assets[c.assetId]?.kind === "video";
            c.duration = Math.max(0.3, snapFrame(d.initial - actualShift));
            if (isVideo) c.trimIn = Math.max(0, d.initialTrim + actualShift);
            break;
          }
        }, { history: false });
        void shift;
        break;
      }
      case "trim-end": {
        st.update((dd) => {
          for (const g of dd.groups) {
            const c = g.clips.find((x) => x.id === d.clipId);
            if (!c) continue;
            const max = d.asset.kind === "video" ? Math.max(0.3, d.asset.duration - c.trimIn) : Infinity;
            const want = snapTime(Math.max(d.segStart + 0.3, t));
            c.duration = snapFrame(clamp(want - d.segStart, 0.3, max));
            break;
          }
        }, { history: false });
        break;
      }
      case "cue": {
        const dt = t - d.grabT;
        st.update((dd) => {
          const arr = d.track === "top" ? dd.subtitles.top : dd.subtitles.bottom;
          const c = arr.find((x) => x.id === d.cueId);
          if (!c) return;
          const len = d.initial.end - d.initial.start;
          if (d.mode === "move") {
            const s = Math.max(0, snapFrame(d.initial.start + dt));
            c.start = s;
            c.end = s + len;
          } else if (d.mode === "start") {
            c.start = clamp(snapFrame(d.initial.start + dt), 0, c.end - 0.1);
          } else {
            c.end = Math.max(c.start + 0.1, snapFrame(d.initial.end + dt));
          }
        }, { history: false });
        break;
      }
      case "text": {
        const dt = t - d.grabT;
        st.update((dd) => {
          const item = dd.texts.find((x) => x.id === d.textId);
          if (!item) return;
          if (d.mode === "move") {
            item.start = Math.max(0, snapFrame(d.initial.start + dt));
          } else if (d.mode === "start") {
            const end = d.initial.start + d.initial.duration;
            const s = clamp(snapFrame(d.initial.start + dt), 0, end - 0.2);
            item.start = s;
            item.duration = end - s;
          } else {
            item.duration = Math.max(0.2, snapFrame(d.initial.duration + dt));
          }
        }, { history: false });
        break;
      }
      case "audio": {
        const dt = t - d.grabT;
        st.update((dd) => {
          const a = dd.audio.find((x) => x.id === d.audioId);
          if (!a) return;
          const asset = st.assets[a.assetId];
          if (d.mode === "move") {
            a.start = Math.max(0, snapFrame(d.initial.start + dt));
          } else if (d.mode === "start") {
            const end = d.initial.start + d.initial.duration;
            const s = clamp(snapFrame(d.initial.start + dt), 0, end - 0.5);
            const shift = s - d.initial.start;
            a.start = s;
            a.duration = end - s;
            if (asset) a.trimIn = clamp(d.initial.trimIn + shift, 0, Math.max(0, asset.duration - 0.5));
          } else {
            const max = asset ? asset.duration - a.trimIn : Infinity;
            a.duration = clamp(snapFrame(d.initial.duration + dt), 0.5, max);
          }
        }, { history: false });
        break;
      }
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    const hint: { groupId: ID; index: number } | null = dropHintRef.current;
    dragRef.current = null;
    dropHintRef.current = null;
    setDropHint(null);
    setSnapLine(null);
    if (d?.kind === "clip" && d.moved && hint) {
      if (hint.groupId !== d.fromGroup || hint.index !== d.fromIndex) {
        moveClip(d.clipId, hint.groupId, hint.index);
        useEditor.getState().select({ kind: "clip", id: d.clipId });
      }
    }
  };

  const beginDrag = (d: DragState) => {
    dragRef.current = d;
    useEditor.getState().beginGesture();
    const move = (ev: PointerEvent) => onPointerMove(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onPointerUp();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const pps = zoom;

  return (
    <div className="shrink-0 border-t border-line bg-ink-2" style={{ height: collapsed ? 32 : Math.min(320, 140 + rows.length * ROW_H) }}>
      {/* Toolbar */}
      <div className="flex h-8 items-center gap-1 border-b border-line/70 bg-ink-1 px-2">
        <IconButton label={collapsed ? "展开时间线" : "收起时间线"} className="h-7 w-7" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </IconButton>
        <span className="px-1 text-[11px] font-semibold tracking-[0.14em] text-fog uppercase">时间线</span>
        <span className="ml-1 font-mono text-[11px] text-fog">{formatTimecode(layout.duration)}</span>
        <div className="flex-1" />
        <IconButton label={snapOn ? "吸附：开" : "吸附：关"} active={snapOn} className="h-7 w-7" onClick={() => setSnapOn(!snapOn)}>
          <Magnet size={14} />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-line" />
        <IconButton label="缩小 (Ctrl+滚轮)" className="h-7 w-7" onClick={() => setZoom(zoom / 1.3)}>
          <ZoomOut size={14} />
        </IconButton>
        <input
          type="range"
          className="range w-28"
          min={MIN_PPS}
          max={MAX_PPS}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          title="时间线缩放"
        />
        <IconButton label="放大 (Ctrl+滚轮)" className="h-7 w-7" onClick={() => setZoom(zoom * 1.3)}>
          <ZoomIn size={14} />
        </IconButton>
        <span className="w-14 text-right font-mono text-[11px] text-fog">{Math.round(zoom)}px/s</span>
      </div>

      {!collapsed && (
        <div ref={scrollRef} className="relative h-[calc(100%-32px)] overflow-x-auto overflow-y-auto">
          <div ref={innerRef} className="relative" style={{ width: contentW, minHeight: "100%" }}>
            {/* Ruler */}
            <Ruler zoom={pps} duration={duration} onSeek={(t) => {
              transport.pause();
              transport.seek(snapTime(t));
            }} />

            {/* Rows */}
            {rows.map((row, i) => {
              const y = RULER_H + i * ROW_H;
              return (
                <div
                  key={row.key}
                  className={clsx("absolute left-0 flex items-stretch border-b border-line/50", i % 2 === 0 ? "bg-ink-2" : "bg-[#1e1a17]")}
                  style={{ top: y, height: ROW_H, width: contentW }}
                  data-group-row={row.kind === "group" ? row.group!.id : undefined}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      useEditor.getState().setActiveGroup(row.group?.id ?? null);
                      if (row.group) useEditor.getState().select({ kind: "group", id: row.group.id });
                      transport.pause();
                      transport.seek(snapTime(timeFromEvent(e.clientX)));
                    }
                  }}
                >
                  <div className="sticky left-0 z-20 flex w-[132px] shrink-0 items-center gap-1.5 border-r border-line bg-ink-3 px-2">
                    <RowIcon kind={row.kind} />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-mist">{row.label}</span>
                    {row.kind === "group" && (
                      <div className="flex flex-col opacity-60">
                        <button
                          className="hover:text-paper"
                          title="上移分组"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveGroup(row.group!.id, i - rows.findIndex((r) => r.kind === "group") - 1);
                          }}
                        >
                          <ChevronUp size={11} />
                        </button>
                        <button
                          className="hover:text-paper"
                          title="下移分组"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveGroup(row.group!.id, i - rows.findIndex((r) => r.kind === "group") + 1);
                          }}
                        >
                          <ChevronDown size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative flex-1" />
                </div>
              );
            })}

            {/* Bars layer */}
            <div className="absolute top-0 left-[132px]" style={{ width: contentW - HEADER_W }}>
              {rows.map((row, i) => (
                <div key={row.key} className="absolute inset-x-0" style={{ top: RULER_H + i * ROW_H, height: ROW_H }}>
                  <RowBars
                    row={row}
                    layout={layout}
                    project={project}
                    assets={assets}
                    zoom={pps}
                    selection={selection}
                    dropHint={dropHint}
                    onClipDown={(e, seg) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      const t = timeFromEvent(e.clientX);
                      useEditor.getState().select({ kind: "clip", id: seg.key });
                      useEditor.getState().setActiveGroup(seg.group!.id);
                      beginDrag({ kind: "clip", clipId: seg.key, fromGroup: seg.group!.id, fromIndex: seg.clipIndex, grabT: t, moved: false, startX: e.clientX, startY: e.clientY });
                    }}
                    onTrimDown={(e, seg, mode) => {
                      e.stopPropagation();
                      const asset = assets[seg.assetId!];
                      if (!asset) return;
                      useEditor.getState().select({ kind: "clip", id: seg.key });
                      beginDrag({ kind: mode, clipId: seg.key, initial: seg.clip!.duration, initialTrim: seg.clip!.trimIn, segStart: seg.start, segEnd: seg.end, asset });
                    }}
                    onCueDown={(e, track, cue, mode) => {
                      e.stopPropagation();
                      useEditor.getState().select({ kind: track === "top" ? "cue-top" : "cue-bottom", id: cue.id });
                      beginDrag({ kind: "cue", track, cueId: cue.id, mode, initial: { ...cue }, grabT: timeFromEvent(e.clientX) });
                    }}
                    onTextDown={(e, item, mode) => {
                      e.stopPropagation();
                      useEditor.getState().select({ kind: "text", id: item.id });
                      beginDrag({ kind: "text", textId: item.id, mode, initial: { ...item }, grabT: timeFromEvent(e.clientX) });
                    }}
                    onAudioDown={(e, a, mode) => {
                      e.stopPropagation();
                      useEditor.getState().select({ kind: "audio", id: a.id });
                      beginDrag({ kind: "audio", audioId: a.id, mode, initial: { ...a }, grabT: timeFromEvent(e.clientX) });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Snap guide */}
            {snapLine !== null && (
              <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-amber/80" style={{ left: HEADER_W + snapLine * pps }} />
            )}

            {/* Playhead */}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute top-0 bottom-0 z-40 will-change-transform"
              style={{ left: HEADER_W, transform: `translateX(${transport.time * pps}px)` }}
            >
              <div className="safelight-glow absolute -top-0.5 -left-[7px] h-3.5 w-3.5 rounded-b-sm bg-safelight [clip-path:polygon(0_0,100%_0,100%_55%,50%_100%,0_55%)]" />
              <div className="safelight-glow absolute top-0 bottom-0 left-0 w-[2px] bg-safelight" />
            </div>

            {/* Ruler click layer above rows (captures playhead dragging) */}
            <div
              className="absolute top-0 right-0 left-[132px] z-30 cursor-col-resize"
              style={{ height: RULER_H }}
              onPointerDown={(e) => {
                onPlayheadDown(e);
              }}
            />

          </div>
        </div>
      )}
    </div>
  );
}

function RowIcon({ kind }: { kind: string }) {
  const cls = "shrink-0 text-fog";
  switch (kind) {
    case "intro":
    case "title":
      return <Layers size={12} className={cls} />;
    case "group":
      return <Layers size={12} className={cls} />;
    case "text":
      return <Type size={12} className={cls} />;
    case "sub":
      return <Captions size={12} className={cls} />;
    case "audio":
      return <Music2 size={12} className={cls} />;
    default:
      return <div className="h-2.5 w-2.5 rounded-[2px] border border-fog" />;
  }
}

/* Ruler ------------------------------------------------------------- */

const Ruler = memo(function Ruler({ zoom, duration, onSeek }: { zoom: number; duration: number; onSeek: (t: number) => void }) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => s * zoom >= 64) ?? 600;
  const minor = step / 5;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + step; t += minor) ticks.push(Math.round(t * 1000) / 1000);
  return (
    <div className="absolute top-0 left-0 z-10 flex border-b border-line bg-ink-1" style={{ height: RULER_H, width: `calc(100% - 132px)` }}>
      <div className="sticky left-0 z-20 flex w-[132px] shrink-0 items-center border-r border-line bg-ink-3 px-2 font-mono text-[10px] text-fog">
        {formatTimecode(0, false)} — {formatTimecode(duration, false)}
      </div>
      <div
        className="relative flex-1 cursor-col-resize overflow-hidden"
        onPointerDown={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onSeek(Math.max(0, (e.clientX - r.left) / zoom));
        }}
      >
        {ticks.map((t, i) => {
          const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
          return (
            <div key={i} className="absolute bottom-0" style={{ left: t * zoom }}>
              <div className={clsx("w-px bg-ink-5", major ? "h-3" : "h-1.5")} />
              {major && (
                <span className="absolute bottom-[13px] left-1 font-mono text-[10px] whitespace-nowrap text-fog">
                  {t >= 60 ? formatTimecode(t, false) : `${t}s`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

/* Row content --------------------------------------------------------- */

interface RowProps {
  row: { key: string; kind: "intro" | "title" | "group" | "text" | "sub" | "audio" | "logo"; label: string; group?: Group };
  layout: Layout;
  project: Project;
  assets: Record<ID, AssetMeta>;
  zoom: number;
  selection: { kind: string; id: string } | null;
  dropHint: { groupId: ID; index: number } | null;
  onClipDown: (e: React.PointerEvent, seg: Segment) => void;
  onTrimDown: (e: React.PointerEvent, seg: Segment, mode: "trim-start" | "trim-end") => void;
  onCueDown: (e: React.PointerEvent, track: "top" | "bottom", cue: Cue, mode: "move" | "start" | "end") => void;
  onTextDown: (e: React.PointerEvent, item: TextItem, mode: "move" | "start" | "end") => void;
  onAudioDown: (e: React.PointerEvent, a: AudioClip, mode: "move" | "start" | "end") => void;
}

function RowBars(props: RowProps) {
  const { row, layout, project, assets, zoom, selection, dropHint } = props;
  const select = useEditor((s) => s.select);

  if (row.kind === "intro" || row.kind === "title") {
    const seg = layout.byKey.get(row.kind);
    const outro = layout.outro;
    return (
      <>
        {seg && (
          <button
            className={clsx("absolute top-[7px] h-[30px] rounded-md border px-2 text-left text-[11px] font-medium transition-colors", selection?.kind === row.kind ? "border-safelight bg-safelight/20 text-paper" : "border-ink-5 bg-ink-4 text-mist hover:border-fog")}
            style={{ left: seg.start * zoom, width: Math.max(18, (seg.end - seg.start) * zoom) }}
            onPointerDown={(e) => {
              e.stopPropagation();
              select({ kind: row.kind as "intro", id: row.kind });
              transport.pause();
              transport.seek(seg.cutIn);
            }}
            title={row.kind === "intro" ? "片头（在「品牌」面板里设置）" : "主题标题（在「模板」面板里设置）"}
          >
            <span className="block truncate">{row.kind === "intro" ? `片头 · ${project.style.brand.intro.mode === "video" ? "自定义视频" : project.style.brand.intro.template}` : `主题 · ${project.title.title}`}</span>
          </button>
        )}
        {outro && row.kind === "title" && (
          <button
            className={clsx("absolute top-[7px] h-[30px] rounded-md border px-2 text-left text-[11px] font-medium", selection?.kind === "outro" ? "border-safelight bg-safelight/20" : "border-ink-5 bg-ink-4 text-mist hover:border-fog")}
            style={{ left: outro.start * zoom, width: Math.max(18, (outro.end - outro.start) * zoom) }}
            onPointerDown={(e) => {
              e.stopPropagation();
              select({ kind: "outro", id: "outro" });
              transport.pause();
              transport.seek(outro.cutIn);
            }}
          >
            <span className="block truncate">片尾</span>
          </button>
        )}
      </>
    );
  }

  if (row.kind === "logo") {
    const { logoStart, logoEnd } = layout;
    return (
      <button
        className={clsx("absolute top-[7px] h-[30px] rounded-md border border-dashed px-2 text-left text-[11px]", selection?.kind === "logo" ? "border-safelight bg-safelight/15 text-paper" : "border-fog/40 bg-ink-3 text-fog hover:border-fog")}
        style={{ left: logoStart * zoom, width: Math.max(18, (logoEnd - logoStart) * zoom) }}
        onPointerDown={(e) => {
          e.stopPropagation();
          select({ kind: "logo", id: "logo" });
        }}
      >
        <span className="block truncate">Logo 角标 · 左上角</span>
      </button>
    );
  }

  if (row.kind === "group") {
    const segs = layout.clips.filter((s) => s.group?.id === row.group!.id);
    const selectedGroup = dropHint?.groupId === row.group!.id;
    return (
      <>
        {segs.map((s) => {
          const selected = selection?.kind === "clip" && selection.id === s.key;
          const w = Math.max(6, (s.end - s.start) * zoom);
          return (
            <div
              key={s.key}
              className={clsx("group absolute top-[4px] h-[36px] overflow-hidden rounded-[5px] border transition-shadow duration-100", selected ? "z-10 border-safelight shadow-[0_0_0_1px_#FF5A36,0_6px_18px_-6px_rgba(0,0,0,.8)]" : "border-black/40 hover:border-white/40")}
              style={{ left: s.start * zoom, width: w, background: `${row.group!.color}2a` }}
              onPointerDown={(e) => props.onClipDown(e, s)}
              title={`${assets[s.assetId!]?.name ?? ""}\n${formatTimecode(s.start)} → ${formatTimecode(s.end)}`}
            >
              <ClipContent seg={s} asset={assets[s.assetId!]} color={row.group!.color} w={w} />
              {selected && (
                <>
                  <div className="absolute top-0 bottom-0 left-0 w-[6px] cursor-ew-resize bg-safelight/80" onPointerDown={(e) => props.onTrimDown(e, s, "trim-start")} />
                  <div className="absolute top-0 right-0 bottom-0 w-[6px] cursor-ew-resize bg-safelight/80" onPointerDown={(e) => props.onTrimDown(e, s, "trim-end")} />
                </>
              )}
            </div>
          );
        })}
        {selectedGroup && dropHint && <DropMarker at={dropHint.index} group={row.group!} layout={layout} zoom={zoom} />}
      </>
    );
  }

  if (row.kind === "text") {
    return (
      <>
        {project.texts.map((t) => (
          <div
            key={t.id}
            className={clsx("absolute top-[8px] flex h-[28px] items-center overflow-hidden rounded-[4px] border px-1.5 text-[11px]", selection?.kind === "text" && selection.id === t.id ? "z-10 border-safelight bg-[#E8B44C]/25 text-paper" : "border-[#E8B44C]/40 bg-[#E8B44C]/12 text-[#E8C877] hover:border-[#E8B44C]/80")}
            style={{ left: t.start * zoom, width: Math.max(10, t.duration * zoom) }}
            onPointerDown={(e) => props.onTextDown(e, t, "move")}
            title={t.text}
          >
            <div className="absolute top-0 bottom-0 left-0 w-[5px] cursor-ew-resize" onPointerDown={(e) => props.onTextDown(e, t, "start")} />
            <span className="truncate">{t.text}</span>
            <div className="absolute top-0 right-0 bottom-0 w-[5px] cursor-ew-resize" onPointerDown={(e) => props.onTextDown(e, t, "end")} />
          </div>
        ))}
      </>
    );
  }

  if (row.kind === "sub") {
    const track = row.key === "sub-top" ? "top" : "bottom";
    const cues = project.subtitles[track];
    return (
      <>
        {cues.map((c) => (
          <div
            key={c.id}
            className={clsx("absolute top-[13px] h-[18px] overflow-hidden rounded-[3px] border px-1 text-[10px] leading-4", selection?.kind === `cue-${track}` && selection.id === c.id ? "z-10 border-safelight bg-[#6FA287]/35 text-paper" : "border-[#6FA287]/40 bg-[#6FA287]/15 text-[#A9CBBB] hover:border-[#6FA287]/80")}
            style={{ left: c.start * zoom, width: Math.max(4, (c.end - c.start) * zoom) }}
            onPointerDown={(e) => props.onCueDown(e, track, c, "move")}
            title={c.text}
          >
            <div className="absolute top-0 bottom-0 left-0 w-[4px] cursor-ew-resize" onPointerDown={(e) => props.onCueDown(e, track, c, "start")} />
            <span className="truncate">{c.text.replace(/\n/g, " / ")}</span>
            <div className="absolute top-0 right-0 bottom-0 w-[4px] cursor-ew-resize" onPointerDown={(e) => props.onCueDown(e, track, c, "end")} />
          </div>
        ))}
      </>
    );
  }

  // Audio + outro row
  const outro = layout.outro;
  return (
    <>
      {project.audio.map((a) => (
        <div
          key={a.id}
          className={clsx("absolute top-[6px] flex h-[32px] items-center overflow-hidden rounded-[4px] border", selection?.kind === "audio" && selection.id === a.id ? "z-10 border-safelight" : "border-[#5B8DB8]/50 hover:border-[#5B8DB8]")}
          style={{ left: a.start * zoom, width: Math.max(8, a.duration * zoom), background: "#5B8DB822" }}
          onPointerDown={(e) => props.onAudioDown(e, a, "move")}
          title={assets[a.assetId]?.name}
        >
          <Waveform assetId={a.assetId} width={Math.max(8, a.duration * zoom)} />
          <span className="relative z-10 truncate px-1.5 text-[10px] text-[#A9C4DE]">{assets[a.assetId]?.name}</span>
          <div className="absolute top-0 bottom-0 left-0 w-[5px] cursor-ew-resize" onPointerDown={(e) => props.onAudioDown(e, a, "start")} />
          <div className="absolute top-0 right-0 bottom-0 w-[5px] cursor-ew-resize" onPointerDown={(e) => props.onAudioDown(e, a, "end")} />
        </div>
      ))}
      {outro && (
        <button
          className={clsx("absolute top-[7px] h-[30px] rounded-md border px-2 text-left text-[11px]", selection?.kind === "outro" ? "border-safelight bg-safelight/20 text-paper" : "border-ink-5 bg-ink-4 text-mist hover:border-fog")}
          style={{ left: outro.start * zoom, width: Math.max(18, (outro.end - outro.start) * zoom) }}
          onPointerDown={(e) => {
            e.stopPropagation();
            select({ kind: "outro", id: "outro" });
            transport.pause();
            transport.seek(outro.cutIn);
          }}
        >
          <span className="block truncate">片尾 · {project.style.brand.outro.mode === "video" ? "自定义视频" : project.style.brand.outro.template}</span>
        </button>
      )}
    </>
  );
}

function DropMarker({ at, group, layout, zoom }: { at: number; group: Group; layout: Layout; zoom: number }) {
  const seg = at < group.clips.length ? layout.byKey.get(group.clips[at].id) : null;
  const x = seg ? seg.cutIn : (group.clips.length ? layout.byKey.get(group.clips[group.clips.length - 1].id)?.cutOut ?? 0 : 0);
  return <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-[3px] rounded bg-safelight" style={{ left: x * zoom }} />;
}

function ClipContent({ seg, asset, color, w }: { seg: Segment; asset: AssetMeta | undefined; color: string; w: number }) {
  const thumb = useThumb(asset?.kind === "image" || asset?.kind === "video" ? asset.id : null);
  if (!asset) return null;
  const showThumb = w > 46;
  return (
    <div className="flex h-full items-center gap-1.5">
      {showThumb && thumb && (
        <img src={thumb} alt="" className="ml-[2px] h-[32px] w-[50px] shrink-0 rounded-[3px] object-cover" draggable={false} />
      )}
      {w > 90 && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10.5px] font-medium text-paper/90">{asset.name}</div>
          <div className="font-mono text-[9.5px] text-fog">{(seg.end - seg.start).toFixed(1)}s</div>
        </div>
      )}
      <div className="absolute top-0 right-0 h-full w-[3px] opacity-60" style={{ background: color }} />
    </div>
  );
}

function Waveform({ assetId, width }: { assetId: ID; width: number }) {
  const asset = useEditor((s) => s.assets[assetId]);
  const peaks = asset?.peaks;
  if (!peaks || !peaks.length) return null;
  const bars = Math.max(1, Math.min(Math.floor(width / 2), peaks.length));
  const step = peaks.length / bars;
  const d: string[] = [];
  for (let i = 0; i < bars; i++) {
    const p = peaks[Math.floor(i * step)] ?? 0;
    const h = Math.max(1, p * 28);
    d.push(`M${i * 2} ${16 - h / 2}v${h}`);
  }
  return (
    <svg className="absolute inset-0 h-full w-full opacity-60" viewBox={`0 0 ${bars * 2} 32`} preserveAspectRatio="none">
      <path d={d.join("")} stroke="#7FB0DD" strokeWidth="1" />
    </svg>
  );
}
