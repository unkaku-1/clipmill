import { useState } from "react";
import { FileText, Languages, Trash2, Upload } from "lucide-react";
import type { SubtitleTarget } from "@/subtitles/parse";
import { useEditor, useLayout } from "@/store/editor";
import { importSubtitles } from "@/lib/subtitles";
import { transport } from "@/engine/transport";
import { Button, Select, Toggle } from "@/components/ui/controls";
import { toast } from "@/components/ui/feedback";
import { formatTimecode } from "@/lib/util";

export function SubtitlesPanel() {
  const project = useEditor((s) => s.project)!;
  const layout = useLayout()!;
  const update = useEditor((s) => s.update);
  const [target, setTarget] = useState<SubtitleTarget>("bi-bottom-first");
  const [replace, setReplace] = useState(true);
  const [fileName, setFileName] = useState("");
  const [parsedCount, setParsedCount] = useState(0);
  const [fileText, setFileText] = useState("");
  const top = project.subtitles.top;
  const bottom = project.subtitles.bottom;

  const apply = async () => {
    if (!fileName) return;
    const ok = await importSubtitles(fileName, fileText, target, replace, layout.duration);
    if (ok) toast("字幕已导入", "success");
    else toast("没有解析到字幕，请检查文件格式", "error");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <label className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-[11px] text-fog hover:border-safelight/60 hover:text-mist">
          <Upload size={15} />
          {fileName ? <span className="max-w-[240px] truncate text-mist">{fileName} · {parsedCount} 条</span> : <span>选择 .lrc 或 .srt 文件</span>}
          <input
            type="file"
            accept=".lrc,.srt,.txt,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              setFileName(f.name);
              setFileText(text);
              const { parseSubtitleFile, looksBilingual } = await import("@/subtitles/parse");
              const parsed = parseSubtitleFile(f.name, text, layout.duration);
              setParsedCount(parsed.length);
              if (looksBilingual(parsed)) setTarget("bi-bottom-first");
              e.target.value = "";
            }}
          />
        </label>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-fog">
            <Languages size={12} /> 放入轨道
          </div>
          <Select
            value={target}
            onChange={setTarget}
            options={[
              { id: "bi-bottom-first", label: "双语：第一行→底部，第二行→顶部" },
              { id: "bi-top-first", label: "双语：第一行→顶部，第二行→底部" },
              { id: "bottom", label: "全部放到底部" },
              { id: "top", label: "全部放到顶部" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between">
          <Toggle checked={replace} onChange={setReplace} label="替换现有字幕" />
          <Button size="sm" variant="primary" disabled={!fileName} onClick={apply}>
            导入
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
        <div className="bg-ink-2 px-3 py-2">
          <Toggle checked={project.style.subtitleTop.enabled} onChange={(v) => update((d) => void (d.style.subtitleTop.enabled = v))} label="顶部字幕" />
          <div className="mt-1 font-mono text-[10px] text-fog">{top.length} 条</div>
        </div>
        <div className="bg-ink-2 px-3 py-2">
          <Toggle checked={project.style.subtitleBottom.enabled} onChange={(v) => update((d) => void (d.style.subtitleBottom.enabled = v))} label="底部字幕" />
          <div className="mt-1 font-mono text-[10px] text-fog">{bottom.length} 条</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <TrackList track="top" />
        <TrackList track="bottom" />
      </div>

      <div className="border-t border-line p-2">
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            if (!confirm("清空全部字幕？")) return;
            update((d) => {
              d.subtitles.top = [];
              d.subtitles.bottom = [];
            });
          }}
        >
          <Trash2 size={13} /> 清空全部字幕
        </Button>
      </div>
    </div>
  );
}

function TrackList({ track }: { track: "top" | "bottom" }) {
  const cues = useEditor((s) => s.project!.subtitles[track]);
  const select = useEditor((s) => s.select);
  const selection = useEditor((s) => s.selection);
  if (!cues.length) return null;
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-semibold tracking-wider text-fog uppercase">
        <FileText size={10} /> {track === "top" ? "顶部" : "底部"} · {cues.length}
      </div>
      {cues.map((c) => (
        <div
          key={c.id}
          onClick={() => {
            select({ kind: track === "top" ? "cue-top" : "cue-bottom", id: c.id });
            transport.pause();
            transport.seek(c.start + 0.01);
          }}
          className={`mb-0.5 cursor-pointer rounded px-1.5 py-1 text-[12px] ${selection?.kind === `cue-${track}` && selection.id === c.id ? "bg-[#6FA287]/25 text-paper" : "hover:bg-ink-3"}`}
        >
          <div className="flex justify-between font-mono text-[9.5px] text-fog">
            <span>{formatTimecode(c.start, false)}</span>
            <span>{formatTimecode(c.end, false)}</span>
          </div>
          <div className="line-clamp-2 whitespace-pre-line">{c.text}</div>
        </div>
      ))}
    </div>
  );
}
