import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { CircleStop, Download, FolderOpen, HardDriveDownload, Languages, Shuffle, WandSparkles } from "lucide-react";
import type { VideoCodec } from "mediabunny";
import { useEditor, useLayout } from "@/store/editor";
import { transport } from "@/engine/transport";
import {
  BITRATES,
  CODEC_LABEL,
  canStreamToDisk,
  detectVideoCodecs,
  estimateSize,
  exportVideo,
  pickSaveFile,
  webCodecsAvailable,
  type CodecSupport,
  type ExportProgress,
  type ResolutionId,
} from "@/engine/export";
import { randomizeMotions, randomizeTransitions, setAllImageDurations, musicEnd, fitImagesToDuration } from "@/engine/automation";
import { computeLayout } from "@/engine/timeline";
import { loadFontsForTexts } from "@/lib/fonts";
import { preloadProjectFonts, buildFontTasks } from "@/lib/preload";
import { RANDOM_POOLS } from "@/engine/catalog";
import { Button, Field, NumberInput, Segmented, Select, Toggle } from "@/components/ui/controls";
import { toast } from "@/components/ui/feedback";
import { formatBytes, formatDuration, formatTimecode } from "@/lib/util";

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export function ExportDialog({ onDone }: { onDone: () => void }) {
  const project = useEditor((s) => s.project)!;
  const assets = useEditor((s) => s.assets);
  const layout = useLayout()!;
  const setExporting = useEditor((s) => s.setExporting);
  const [resolution, setResolution] = useState<ResolutionId>("1080p");
  const [codec, setCodec] = useState<VideoCodec>("avc");
  const [support, setSupport] = useState<CodecSupport[] | null>(null);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [streamDisk, setStreamDisk] = useState(canStreamToDisk());
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ url?: string; name: string; bytes: number; seconds: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const ok = webCodecsAvailable();
  const hasAudio = project.audio.length > 0 || project.groups.some((g) => g.clips.some((c) => assets[c.assetId]?.kind === "video" && assets[c.assetId]?.hasAudio));

  useEffect(() => {
    let alive = true;
    setSupport(null);
    void detectVideoCodecs(resolution, "high").then((list) => {
      if (!alive) return;
      setSupport(list);
      const current = list.find((x) => x.codec === codec);
      if (!current?.ok) {
        const first = list.find((x) => x.ok);
        if (first) setCodec(first.codec);
      }
    });
    return () => {
      alive = false;
    };
  }, [resolution]); // eslint-disable-line react-hooks/exhaustive-deps

  const frames = Math.round(layout.duration * 60);
  const size = estimateSize(layout.duration, resolution, "high");

  const start = async () => {
    if (!ok) {
      toast("当前环境不支持 WebCodecs 导出，请用 HTTPS 访问并升级 Chrome/Edge", "error", 6000);
      return;
    }
    if (!support?.some((s) => s.ok)) {
      toast("没有可用的视频编码器", "error");
      return;
    }
    let fileHandle: FileSystemFileHandle | null = null;
    if (streamDisk) {
      try {
        fileHandle = await pickSaveFile(`${project.name}-${resolution}-60fps.mp4`);
      } catch {
        return; // user cancelled
      }
    }
    transport.pause();
    setRunning(true);
    setExporting(true);
    setResult(null);
    setProgress({ phase: "prepare", frame: 0, total: frames, fps: 0, eta: 0, bytes: 0 });
    abortRef.current = new AbortController();
    try {
      await preloadProjectFonts(buildFontTasks(project).flat());
      await loadFontsForTexts([{ fontId: "bebas", weight: 400, text: "321" }]);
      const res = await exportVideo(
        project,
        assets,
        { resolution, quality: "high", codec, includeAudio: includeAudio && hasAudio, fileHandle },
        (p) => setProgress(p),
        (canvas) => {
          const el = previewRef.current;
          if (!el) return;
          el.width = canvas.width;
          el.height = canvas.height;
          el.getContext("2d")?.drawImage(canvas, 0, 0);
        },
        abortRef.current.signal,
      );
      const name = `${project.name}-${resolution}-60fps.mp4`;
      if (res.blob) {
        const url = URL.createObjectURL(res.blob);
        setResult({ url, name, bytes: res.bytes, seconds: res.seconds });
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
      } else {
        setResult({ name, bytes: res.bytes, seconds: res.seconds });
      }
      toast("导出完成", "success");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") toast("已取消导出", "info");
      else toast(`导出失败：${e instanceof Error ? e.message : e}`, "error", 8000);
    } finally {
      setRunning(false);
      setExporting(false);
      abortRef.current = null;
    }
  };

  const pct = progress ? (progress.phase === "render" ? progress.frame / Math.max(1, progress.total) : progress.phase === "done" ? 1 : 0.02) : 0;
  const phaseLabel = progress
    ? progress.phase === "prepare"
      ? "准备字体与素材…"
      : progress.phase === "audio"
        ? "混音…"
        : progress.phase === "render"
          ? "逐帧渲染与编码"
          : progress.phase === "finalize"
            ? "封装 MP4…"
            : "完成"
    : "";

  return (
    <div className="space-y-4 p-4">
      {!ok && (
        <div className="rounded-md border border-amber/50 bg-amber/10 px-3 py-2 text-xs text-amber">
          当前环境不支持 WebCodecs（需要 HTTPS 或 localhost + Chrome/Edge 桌面版）。
        </div>
      )}
      <div className="grid grid-cols-[130px_1fr] items-center gap-3">
        <span className="text-xs text-fog">分辨率</span>
        <Segmented
          value={resolution}
          onChange={(v) => setResolution(v)}
          options={[
            { id: "1080p", label: "1080P" },
            { id: "4k", label: "4K" },
          ]}
        />
        <span className="text-xs text-fog">帧率</span>
        <div className="text-xs text-mist">60 fps 固定（{frames.toLocaleString()} 帧 · {formatDuration(layout.duration)}）</div>
        <span className="text-xs text-fog">编码器</span>
        <Select
          value={codec}
          onChange={(v) => setCodec(v as VideoCodec)}
          options={(["avc", "hevc", "av1", "vp9"] as VideoCodec[]).map((c) => ({
            id: c,
            label: `${CODEC_LABEL[c]}${support ? (support.find((s) => s.codec === c)?.ok ? "" : " · 不可用") : " · 检测中…"}`,
          }))}
        />
        <span className="text-xs text-fog">码率</span>
        <div className="font-mono text-xs text-mist">
          约 {(BITRATES[resolution].high / 1e6).toFixed(0)} Mbps · 预计 {formatBytes(size)}
        </div>
        <span className="text-xs text-fog">声音</span>
        <div className="flex items-center gap-3">
          <Toggle checked={includeAudio && hasAudio} onChange={setIncludeAudio} label={hasAudio ? "包含音乐与视频原声" : "工程没有音频"} />
        </div>
        <span className="text-xs text-fog">保存方式</span>
        <div className="flex items-center gap-2 text-xs">
          {canStreamToDisk() ? (
            <Segmented
              value={streamDisk ? "disk" : "memory"}
              onChange={(v) => setStreamDisk(v === "disk")}
              options={[
                { id: "disk", label: "直接写入硬盘（推荐）" },
                { id: "memory", label: "在内存中生成" },
              ]}
            />
          ) : (
            <span className="text-fog">浏览器不支持文件选择器，将在内存中生成后自动下载</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-ink-1 p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-mist">{phaseLabel || "准备就绪"}</span>
          <span className="font-mono text-fog">{Math.round(pct * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-4">
          <div className={clsx("h-full transition-[width] duration-200", running ? "develop-bar" : "bg-safelight")} style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px] text-fog">
          <span>帧 {progress?.frame ?? 0} / {frames}</span>
          <span>{progress?.fps ? `${progress.fps.toFixed(1)} fps` : "—"}</span>
          <span className="text-right">{progress?.eta ? `剩余 ${formatDuration(progress.eta)}` : "—"}</span>
        </div>
        <canvas ref={previewRef} className="mt-2 hidden max-h-40 w-full rounded object-contain" />
      </div>

      {result && (
        <div className="flex items-center gap-2 rounded-md border border-moss/40 bg-moss/10 px-3 py-2 text-xs text-[#A9CBBB]">
          <FolderOpen size={14} />
          <span className="min-w-0 flex-1 truncate">
            {streamDisk ? `已写入：${result.name}` : `已生成：${result.name}`} · {formatBytes(result.bytes)} · 用时 {result.seconds.toFixed(0)} 秒
          </span>
          {result.url && (
            <a href={result.url} download={result.name} className="rounded bg-ink-4 px-2 py-0.5 text-paper">
              <Download size={11} className="mr-1 inline" /> 重新下载
            </a>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {running ? (
          <Button variant="danger" onClick={() => abortRef.current?.abort()}>
            <CircleStop size={14} /> 取消导出
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onDone}>
              关闭
            </Button>
            <Button variant="primary" onClick={start} disabled={!ok}>
              <HardDriveDownload size={15} /> 开始导出
            </Button>
          </>
        )}
      </div>
      <div className="text-[11px] leading-relaxed text-fog">
        导出期间请保持此标签页在前台。4K 60 帧对显卡有一定要求，导出速度取决于编码硬件；中途可以随时取消。
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subtitles                                                           */
/* ------------------------------------------------------------------ */

export function SubtitlesDialog({ onDone, textCount }: { onDone: () => void; textCount: number }) {
  const project = useEditor((s) => s.project)!;
  const layout = useLayout()!;
  const update = useEditor((s) => s.update);
  const [offset, setOffset] = useState(0);
  const [topEnabled, setTopEnabled] = useState(project.style.subtitleTop.enabled);
  const [bottomEnabled, setBottomEnabled] = useState(project.style.subtitleBottom.enabled);
  const { importSubtitles } = useMemo(() => ({ importSubtitles: (n: string, t: string) => import("@/lib/subtitles").then((m) => m.importSubtitles(n, t, "bi-bottom-first", false, layout.duration)) }), [layout.duration]);
  void textCount;

  const applyOffset = () => {
    update((d) => {
      for (const c of [...d.subtitles.top, ...d.subtitles.bottom]) {
        c.start = Math.max(0, c.start + offset);
        c.end = Math.max(c.start + 0.1, c.end + offset);
      }
    });
    setOffset(0);
    toast("已整体平移字幕", "success");
  };

  return (
    <div className="grid grid-cols-[1fr_260px] gap-4 p-4">
      <div className="min-h-[320px] rounded-lg border border-line bg-ink-1">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
          <Languages size={14} className="text-moss" />
          <span className="font-medium">双语字幕预览</span>
          <span className="font-mono text-fog">{project.subtitles.top.length} 顶部 / {project.subtitles.bottom.length} 底部</span>
        </div>
        <div className="max-h-[380px] overflow-y-auto p-2">
          {project.subtitles.top.length + project.subtitles.bottom.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-fog">还没有字幕。可以在左侧「字幕」面板导入 .lrc / .srt 文件。</div>
          ) : (
            Array.from(new Map([...project.subtitles.bottom, ...project.subtitles.top].map((c) => [`${c.start}`, c])).values())
              .sort((a, b) => a.start - b.start)
              .map((c) => {
                const top = project.subtitles.top.find((t) => Math.abs(t.start - c.start) < 0.05);
                const bottom = project.subtitles.bottom.find((t) => Math.abs(t.start - c.start) < 0.05);
                return (
                  <div key={c.id} className="flex gap-2 border-b border-line/40 px-2 py-1.5 text-xs">
                    <span className="w-14 shrink-0 font-mono text-[10px] text-fog">{formatTimecode(c.start, false)}</span>
                    <div className="min-w-0 flex-1">
                      {top && <div className="truncate text-[#FFE9A8]">↑ {top.text}</div>}
                      {bottom && <div className="truncate text-paper">↓ {bottom.text}</div>}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-xs font-medium">轨道</div>
          <div className="space-y-2">
            <Toggle checked={topEnabled} onChange={(v) => {
              setTopEnabled(v);
              update((d) => void (d.style.subtitleTop.enabled = v));
            }} label="顶部字幕" />
            <Toggle checked={bottomEnabled} onChange={(v) => {
              setBottomEnabled(v);
              update((d) => void (d.style.subtitleBottom.enabled = v));
            }} label="底部字幕" />
          </div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-xs font-medium">整体时间平移</div>
          <div className="flex items-center gap-2">
            <NumberInput value={offset} min={-60} max={60} step={0.1} unit="s" onChange={setOffset} />
            <Button size="sm" onClick={applyOffset} disabled={!offset}>
              应用
            </Button>
          </div>
          <div className="mt-1 text-[11px] text-fog">歌词比画面早/晚时用来校准</div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-xs font-medium">快速导入</div>
          <label className="flex h-9 cursor-pointer items-center justify-center rounded-md border border-dashed border-line text-[11px] text-fog hover:border-safelight/60 hover:text-mist">
            选择 .lrc / .srt（追加）
            <input type="file" accept=".lrc,.srt,.txt" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              await importSubtitles(f.name, await f.text());
              toast("已追加字幕", "success");
              e.target.value = "";
            }} />
          </label>
        </div>
        <Button variant="primary" className="w-full" onClick={onDone}>
          完成
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One-click                                                           */
/* ------------------------------------------------------------------ */

export function OneClickDialog({ onDone }: { onDone: () => void }) {
  const project = useEditor((s) => s.project)!;
  const assets = useEditor((s) => s.assets);
  const update = useEditor((s) => s.update);
  const [pool, setPool] = useState(project.style.sequence.randomPool);
  const [imageDur, setImageDur] = useState(project.style.sequence.imageDuration);
  const [fitMusic, setFitMusic] = useState(musicEnd(project) > 0);
  const [transitions, setTransitions] = useState(true);
  const [motions, setMotions] = useState(true);

  const run = () => {
    update((d) => {
      d.style.sequence.randomPool = pool;
      if (transitions) randomizeTransitions(d, pool);
      if (motions) randomizeMotions(d, assets);
      if (!fitMusic) setAllImageDurations(d, assets, imageDur);
    });
    if (fitMusic) {
      const end = musicEnd(useEditor.getState().project!);
      const res = fitImagesToDuration(useEditor.getState().project!, assets, end);
      if (res.ok) {
        let per = res.per;
        for (let i = 0; i < 4; i++) {
          update((d) => setAllImageDurations(d, assets, per), { history: false });
          const cur = useEditor.getState().project!;
          const dur = computeLayout(cur, assets).duration;
          const n = cur.groups.flatMap((g) => g.clips).filter((c) => assets[c.assetId]?.kind === "image").length;
          const err = end - dur;
          if (Math.abs(err) < 1 / 60 || !n) break;
          per += err / n;
        }
        toast(`已适配音乐：每张 ${per.toFixed(2)} 秒，视频 ${formatDuration(end)}`, "success");
      } else {
        toast(res.reason, "error");
      }
    } else {
      toast("已一键成片", "success");
    }
    onDone();
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3 rounded-lg border border-safelight/30 bg-safelight/5 px-3 py-2.5">
        <WandSparkles size={20} className="text-safelight" />
        <div className="text-xs leading-relaxed text-mist">按分组顺序自动排片：随机过渡、随机运镜，还可以让视频刚好等于背景音乐长度。</div>
      </div>
      <Field label="过渡风格">
        <Select value={pool} onChange={(v) => setPool(v)} options={RANDOM_POOLS.map((p) => ({ id: p.id, label: `${p.label} — ${p.hint}` }))} />
      </Field>
      <div className="space-y-2 rounded-lg border border-line p-3">
        <Toggle checked={transitions} onChange={setTransitions} label="随机过渡（相邻镜头不重复）" />
        <Toggle checked={motions} onChange={setMotions} label="随机图片运镜（推拉摇移）" />
        <Toggle checked={fitMusic && musicEnd(project) > 0} onChange={setFitMusic} label={`适配音乐时长${musicEnd(project) > 0 ? `（${formatDuration(musicEnd(project))}）` : "（还没有音乐）"}`} />
      </div>
      {!fitMusic && (
        <Field label="每张图片">
          <NumberInput value={imageDur} min={0.5} max={20} step={0.1} unit="s" slider onChange={setImageDur} />
        </Field>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          取消
        </Button>
        <Button variant="primary" onClick={run}>
          <Shuffle size={14} /> 一键成片
        </Button>
      </div>
    </div>
  );
}
