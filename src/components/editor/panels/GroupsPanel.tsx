import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, FolderPlus, GripVertical, Image as ImageIcon, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useEditor } from "@/store/editor";
import { useThumb } from "@/engine/blobs";
import { addGroup, deleteGroup, moveClip, moveGroup, removeClips } from "@/components/editor/actions";
import { randomizeTransitions } from "@/engine/automation";
import { Button, IconButton } from "@/components/ui/controls";
import { toast } from "@/components/ui/feedback";

export function GroupsPanel() {
  const project = useEditor((s) => s.project)!;
  const activeGroupId = useEditor((s) => s.activeGroupId);
  const setActiveGroup = useEditor((s) => s.setActiveGroup);
  const selection = useEditor((s) => s.selection);
  const [open, setOpen] = useState<Set<string>>(() => new Set(project.groups.map((g) => g.id)));
  const [dragClip, setDragClip] = useState<{ groupId: string; index: number } | null>(null);

  const toggle = (id: string) => {
    const s = new Set(open);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setOpen(s);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <Button className="w-full" onClick={() => addGroup()}>
          <FolderPlus size={14} /> 新建主题分组
        </Button>
        <div className="mt-1.5 text-[11px] leading-relaxed text-fog">
          每个分组是一个主题（如「秋日登山」），组内素材播放时左下角自动显示分组名。
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {project.groups.map((g, gi) => (
          <div
            key={g.id}
            className={clsx("rounded-lg border transition-colors", activeGroupId === g.id ? "border-safelight/50 bg-ink-3" : "border-line bg-ink-3/50")}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/clipmill-asset")) e.preventDefault();
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/clipmill-asset");
              if (id) {
                e.preventDefault();
                void import("@/components/editor/actions").then((m) => m.addAssetsToGroup([id], g.id));
              }
            }}
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <button className="text-fog hover:text-paper" onClick={() => toggle(g.id)}>
                <ChevronDown size={14} className={clsx("transition-transform", !open.has(g.id) && "-rotate-90")} />
              </button>
              <GripVertical size={12} className="cursor-grab text-fog/50" />
              <span className="h-3 w-1.5 shrink-0 rounded-full" style={{ background: g.color }} />
              <input
                value={g.name}
                onChange={(e) => {
                  const v = e.target.value;
                  useEditor.getState().update((d) => {
                    const gg = d.groups.find((x) => x.id === g.id);
                    if (gg) gg.name = v;
                  }, { coalesce: `group-name-${g.id}` });
                }}
                onFocus={() => setActiveGroup(g.id)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[13px] font-medium outline-none hover:border-line focus:border-safelight/60 focus:bg-ink-1"
                placeholder="分组主题名"
              />
              <span className="font-mono text-[10px] text-fog">{g.clips.length}</span>
              <div className="flex flex-col opacity-50 hover:opacity-100">
                <button onClick={() => moveGroup(g.id, gi - 1)} disabled={gi === 0} className="disabled:opacity-30" title="上移">
                  <ChevronDown size={10} className="rotate-180" />
                </button>
                <button onClick={() => moveGroup(g.id, gi + 1)} disabled={gi === project.groups.length - 1} className="disabled:opacity-30" title="下移">
                  <ChevronDown size={10} />
                </button>
              </div>
              <IconButton
                label="删除分组"
                className="h-6 w-6"
                onClick={() => {
                  if (g.clips.length && !confirm(`删除分组「${g.name}」及其中 ${g.clips.length} 个素材？`)) return;
                  deleteGroup(g.id);
                }}
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
            {open.has(g.id) && (
              <div className="px-2 pb-2">
                {g.clips.length === 0 ? (
                  <div className="rounded border border-dashed border-line px-2 py-3 text-center text-[11px] text-fog">从素材面板拖入，或双击素材添加</div>
                ) : (
                  <div className="grid grid-cols-4 gap-1">
                    {g.clips.map((c, i) => (
                      <ClipCell
                        key={c.id}
                        assetId={c.assetId}
                        clipId={c.id}
                        selected={selection?.kind === "clip" && selection.id === c.id}
                        onDragStart={() => setDragClip({ groupId: g.id, index: i })}
                        onDropAt={() => {
                          const dragged = project.groups.find((x) => x.id === dragClip?.groupId)?.clips[dragClip!.index];
                          if (dragged) moveClip(dragged.id, g.id, i);
                          setDragClip(null);
                        }}
                      />
                    ))}
                  </div>
                )}
                <div className="mt-1.5 flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 flex-1 text-[11px]"
                    onClick={() => {
                      useEditor.getState().update((d) => randomizeTransitions(d, d.style.sequence.randomPool, new Set(g.clips.map((c) => c.id))));
                      toast(`已为「${g.name}」随机过渡`, "success");
                    }}
                  >
                    <Wand2 size={11} /> 随机过渡
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 flex-1 text-[11px]"
                    onClick={() => {
                      useEditor.getState().update((d) => {
                        const gg = d.groups.find((x) => x.id === g.id);
                        if (gg) {
                          gg.clips.forEach((c, k) => {
                            const prev = gg.clips[k - 1];
                            if (prev) c.transition = { ...prev.transition };
                          });
                        }
                      });
                    }}
                  >
                    <Sparkles size={11} /> 统一过渡
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClipCell({
  assetId,
  clipId,
  selected,
  onDragStart,
  onDropAt,
}: {
  assetId: string;
  clipId: string;
  selected: boolean;
  onDragStart: () => void;
  onDropAt: () => void;
}) {
  const thumb = useThumb(assetId);
  const select = useEditor((s) => s.select);
  return (
    <div
      className={clsx("group/cell relative aspect-video cursor-grab overflow-hidden rounded-[3px] border", selected ? "border-safelight" : "border-line hover:border-fog")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/clipmill-move", clipId);
        onDragStart();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/clipmill-move")) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("text/clipmill-move")) {
          e.preventDefault();
          e.stopPropagation();
          onDropAt();
        }
      }}
      onClick={() => select({ kind: "clip", id: clipId })}
      title="点击选中，拖动排序"
    >
      {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" /> : <ImageIcon size={12} className="m-auto text-fog" />}
      <button
        className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white hover:text-[#ff8b8f] group-hover/cell:flex"
        title="删除这个镜头"
        onClick={(e) => {
          e.stopPropagation();
          removeClips([clipId]);
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}
