import { useRef, useState } from "react";
import { Music2, Timer, Trash2, Upload } from "lucide-react";
import { useEditor, useLayout } from "@/store/editor";
import { importFile } from "@/engine/importer";
import { fitImagesToDuration, musicEnd, setAllImageDurations } from "@/engine/automation";
import { computeLayout } from "@/engine/timeline";
import { Button, NumberInput } from "@/components/ui/controls";
import { toast } from "@/components/ui/feedback";
import { formatDuration, uid } from "@/lib/util";

export function MusicPanel() {
  const project = useEditor((s) => s.project)!;
  const assets = useEditor((s) => s.assets);
  const layout = useLayout()!;
  const update = useEditor((s) => s.update);
  const addAssets = useEditor((s) => s.addAssets);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const end = musicEnd(project);

  const importMusic = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        try {
          const a = await importFile(f, "audio");
          addAssets([a]);
          update((d) => {
            d.library.push(a.id);
            const start = d.audio.reduce((m, x) => Math.max(m, x.start + x.duration), 0);
            d.audio.push({ id: uid("m"), assetId: a.id, start, trimIn: 0, duration: a.duration, volume: 0.8, fadeIn: 0.5, fadeOut: 2 });
          });
          toast(`已添加音乐：${a.name}`, "success");
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e), "error");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const fitToMusic = () => {
    if (!end) {
      toast("先添加一首背景音乐", "info");
      return;
    }
    const res = fitImagesToDuration(project, assets, end);
    if (!res.ok) {
      toast(res.reason, "error", 5000);
      return;
    }
    // Iterate on the real layout (transitions are clamped by clip length).
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
    toast(`已把每张图片调为 ${per.toFixed(2)} 秒，视频总长 ${formatDuration(end)}`, "success");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <Button className="w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload size={14} /> {busy ? "正在处理音频…" : "添加背景音乐"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
          multiple
          className="hidden"
          onChange={(e) => {
            void importMusic([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <div className="flex items-center justify-between rounded-md border border-line bg-ink-1 px-2 py-1.5 text-[11px]">
          <span className="text-fog">视频 {formatDuration(layout.duration)}</span>
          <span className="text-fog">音乐 {end ? formatDuration(end) : "—"}</span>
        </div>
        <Button variant="primary" className="w-full" onClick={fitToMusic}>
          <Timer size={14} /> 适配音乐时长（自动均分图片）
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {project.audio.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-fog">
            <Music2 size={24} className="text-fog/50" />
            <div>还没有背景音乐</div>
            <div className="text-[11px] text-fog/70">支持 MP3 / M4A / WAV / AAC / FLAC / OGG</div>
          </div>
        ) : (
          project.audio.map((a) => {
            const asset = assets[a.assetId];
            return (
              <div key={a.id} className="mb-1.5 rounded-lg border border-line bg-ink-3/60 p-2">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Music2 size={13} className="shrink-0 text-[#7FB0DD]" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{asset?.name}</span>
                  <button className="text-fog hover:text-[#ff8b8f]" title="移除" onClick={() => update((d) => void (d.audio = d.audio.filter((x) => x.id !== a.id)))}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-1 text-[11px] text-fog">
                  <span>音量</span>
                  <NumberInput value={a.volume} min={0} max={1} step={0.05} slider digits={2} onChange={(v) => update((d) => {
                    const x = d.audio.find((y) => y.id === a.id);
                    if (x) x.volume = v;
                  }, { history: false, coalesce: `vol-${a.id}` })} />
                  <span>开始</span>
                  <NumberInput value={a.start} min={0} step={0.1} unit="s" slider={false} onChange={(v) => update((d) => {
                    const x = d.audio.find((y) => y.id === a.id);
                    if (x) x.start = v;
                  }, { coalesce: `st-${a.id}` })} />
                  <span>淡入</span>
                  <NumberInput value={a.fadeIn} min={0} max={10} step={0.1} unit="s" onChange={(v) => update((d) => {
                    const x = d.audio.find((y) => y.id === a.id);
                    if (x) x.fadeIn = v;
                  }, { coalesce: `fi-${a.id}` })} />
                  <span>淡出</span>
                  <NumberInput value={a.fadeOut} min={0} max={10} step={0.1} unit="s" onChange={(v) => update((d) => {
                    const x = d.audio.find((y) => y.id === a.id);
                    if (x) x.fadeOut = v;
                  }, { coalesce: `fo-${a.id}` })} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
