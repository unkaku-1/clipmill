import { CalendarDays, Copy, Plus, Trash2, Type } from "lucide-react";
import { useEditor, useLayout } from "@/store/editor";
import { transport } from "@/engine/transport";
import { addTextItem, duplicateText } from "@/components/editor/actions";
import { Button, IconButton } from "@/components/ui/controls";
import { formatTimecode } from "@/lib/util";

export function TextPanel() {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const layout = useLayout()!;
  const select = useEditor((s) => s.select);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 gap-1.5 border-b border-line p-3">
        <Button onClick={() => addTextItem("新标题")}>
          <Plus size={13} /> 添加文字
        </Button>
        <Button onClick={() => addTextItem(`${new Date().getMonth() + 1}月`)}>
          <CalendarDays size={13} /> 加月份标
        </Button>
      </div>
      <div className="border-b border-line px-3 py-2 text-[11px] leading-relaxed text-fog">
        文字从播放头位置开始。选中后在右侧面板调整样式，或直接在画面上拖动位置。
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {project.texts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-fog">
            <Type size={24} className="text-fog/50" />
            <div>还没有自定义文字</div>
            <div className="text-[11px] text-fog/70">比如右上角的「11月」，或一句口号</div>
          </div>
        ) : (
          project.texts.map((t) => {
            const active = transport.time >= t.start && transport.time < t.start + t.duration;
            return (
              <div
                key={t.id}
                onClick={() => {
                  select({ kind: "text", id: t.id });
                  transport.pause();
                  transport.seek(t.start + Math.min(0.3, t.duration / 2));
                }}
                className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 ${selection?.kind === "text" && selection.id === t.id ? "border-safelight bg-safelight/10" : active ? "border-[#E8B44C]/50 bg-ink-3" : "border-line bg-ink-3/50 hover:border-ink-5"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{t.text || "（空文字）"}</span>
                  <span className="font-mono text-[10px] text-fog">
                    {formatTimecode(t.start, false)} · {t.duration.toFixed(1)}s
                  </span>
                </span>
                <IconButton label="复制" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => {
                  e.stopPropagation();
                  duplicateText(t.id);
                }}>
                  <Copy size={12} />
                </IconButton>
                <IconButton label="删除" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => {
                  e.stopPropagation();
                  useEditor.getState().update((d) => void (d.texts = d.texts.filter((x) => x.id !== t.id)));
                }}>
                  <Trash2 size={12} />
                </IconButton>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-line px-3 py-2 font-mono text-[10px] text-fog">
        分组小标题 {layout.captionRuns.length} 条 · 自定义文字 {project.texts.length} 条
      </div>
    </div>
  );
}
