import { useRef, useState } from "react";
import clsx from "clsx";
import { FileVideo, FolderPlus, Image as ImageIcon, Plus, Search, Trash2, Upload } from "lucide-react";
import type { AssetMeta } from "@/types/project";
import { useEditor } from "@/store/editor";
import { useThumb } from "@/engine/blobs";
import { addAssetsToGroup, addGroup, removeLibraryAssets } from "@/components/editor/actions";
import { addFilesToProject } from "@/lib/projects";
import { ASSET_DRAG_TYPE } from "@/components/editor/dnd";
import { Button } from "@/components/ui/controls";
import { toast } from "@/components/ui/feedback";
import { formatDuration } from "@/lib/util";

export function MediaPanel() {
  const assets = useEditor((s) => s.assets);
  const project = useEditor((s) => s.project)!;
  const activeGroupId = useEditor((s) => s.activeGroupId);
  const setActiveGroup = useEditor((s) => s.setActiveGroup);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = project.library.map((id) => assets[id]).filter((a): a is AssetMeta => !!a && a.kind !== "audio");
  const filtered = filter ? list.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase())) : list;
  const used = new Set(project.groups.flatMap((g) => g.clips.map((c) => c.assetId)));
  const activeGroup = project.groups.find((g) => g.id === activeGroupId) ?? project.groups[0];

  const importFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy({ done: 0, total: files.length, name: "" });
    try {
      const res = await addFilesToProject(files, {
        // Honour the selected group even when the store has no active group yet.
        groupId: activeGroupId ?? project.groups[0]?.id ?? null,
        onProgress: (done, total, name) => setBusy({ done, total, name }),
      });
      if (res.added.length) toast(`已导入 ${res.added.length} 个素材${activeGroup ? `到「${activeGroup.name}」` : ""}`, "success");
      for (const e of res.errors) toast(e, "error", 5000);
    } finally {
      setBusy(null);
    }
  };

  const isAssetDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(ASSET_DRAG_TYPE);

  const dropOnGroup = (e: React.DragEvent, groupId: string, groupName: string) => {
    const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (!assetId) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroup(null);
    addAssetsToGroup([assetId], groupId);
    setActiveGroup(groupId);
    toast(`已加入「${groupName || "未命名分组"}」`, "success");
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void importFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="space-y-2 border-b border-line p-3">
        <Button variant="primary" className="w-full" onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> 导入照片 / 视频
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,.heic"
          multiple
          className="hidden"
          onChange={(e) => {
            void importFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <div className="flex items-center justify-between text-[11px] text-fog">
          <span>导入到：{activeGroup ? <span className="text-mist">{activeGroup.name || "未命名"}</span> : null}</span>
          <button
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-fog hover:bg-ink-4 hover:text-paper"
            title="新建主题分组"
            onClick={() => {
              const id = addGroup();
              toast("已新建分组，可直接导入素材", "success");
              setActiveGroup(id);
            }}
          >
            <FolderPlus size={11} /> 新分组
          </button>
        </div>
        {/* Group drop targets: drag a thumbnail here to put it in that group without
            leaving the media panel (the 素材 / 分组 panels are separate tabs). */}
        <div
          className="flex flex-wrap gap-1"
          onDragOver={(e) => {
            if (isAssetDrag(e)) e.preventDefault();
          }}
        >
          {project.groups.length === 0 && <span className="text-[11px] text-fog">还没有分组，先点「新分组」</span>}
          {project.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGroup(g.id)}
              onDragOver={(e) => {
                if (!isAssetDrag(e)) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                setDragOverGroup(g.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverGroup((cur) => (cur === g.id ? null : cur));
              }}
              onDrop={(e) => dropOnGroup(e, g.id, g.name)}
              title={`点击：设为导入目标\n把素材缩略图拖到这里：加入「${g.name || "未命名分组"}」`}
              className={clsx(
                "flex max-w-full items-center gap-1 rounded border px-1.5 py-1 text-[11px] transition-colors",
                dragOverGroup === g.id
                  ? "border-moss bg-moss/15 text-paper"
                  : activeGroupId === g.id
                    ? "border-safelight/60 bg-safelight/10 text-paper"
                    : "border-line text-mist hover:border-fog hover:text-paper",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
              <span className="max-w-[96px] truncate">{g.name || "未命名"}</span>
              <span className="font-mono text-[10px] text-fog">{g.clips.length}</span>
            </button>
          ))}
        </div>
        {busy && (
          <div className="rounded-md border border-line bg-ink-1 px-2 py-1.5 text-[11px] text-mist">
            <div className="mb-1 flex justify-between">
              <span className="truncate">正在处理：{busy.name}</span>
              <span className="font-mono text-fog">
                {busy.done}/{busy.total}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded bg-ink-4">
              <div className="h-full bg-safelight transition-[width]" style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <Search size={13} className="text-fog" />
        <input
          className="h-6 w-full bg-transparent text-xs text-paper outline-none placeholder:text-fog/60"
          placeholder={`搜索 ${list.length} 个素材`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-fog">
            <ImageIcon size={26} className="text-fog/50" />
            <div>把照片或视频拖到这里</div>
            <div className="text-[11px] text-fog/70">图片建议 JPG / PNG / WebP，视频建议 H.264 MP4</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {filtered.map((a) => (
              <AssetCell key={a.id} asset={a} used={used.has(a.id)} onAdd={() => addAssetsToGroup([a.id])} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-fog">
        双击素材添加到当前分组；也可以把缩略图拖到上方的分组标签、时间线的分组轨道上。带橙色「新」标记的是还没用过的素材。
      </div>
    </div>
  );
}

function AssetCell({ asset, used, onAdd }: { asset: AssetMeta; used: boolean; onAdd: () => void }) {
  const thumb = useThumb(asset.id);
  return (
    <div
      className={clsx("group relative aspect-video cursor-grab overflow-hidden rounded-[4px] border bg-ink-3", used ? "border-line" : "border-ink-5 ring-1 ring-amber/40")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDoubleClick={onAdd}
      title={`${asset.name}\n双击添加到当前分组，或拖到分组标签 / 时间线轨道`}
    >
      {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" /> : <div className="h-full w-full" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pt-3 pb-0.5">
        <div className="truncate text-[9.5px] text-paper/90">{asset.name}</div>
      </div>
      <div className="pointer-events-none absolute top-0.5 left-0.5 flex gap-0.5">
        {asset.kind === "video" ? (
          <span className="rounded-sm bg-black/70 px-1 font-mono text-[9px] text-white">
            <FileVideo size={9} className="mr-0.5 inline" />
            {formatDuration(asset.duration)}
          </span>
        ) : null}
      </div>
      {!used && <span className="pointer-events-none absolute top-0.5 right-0.5 rounded-sm bg-amber px-1 text-[9px] font-medium text-black">新</span>}
      {/* Add overlay. Rendered BEFORE the delete button so the trash icon stays on
          top of the full-cell mask and remains clickable (regression: mask ate the click). */}
      <button
        type="button"
        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onAdd}
        title="添加到当前分组"
      >
        <Plus size={18} className="text-white" />
      </button>
      <button
        type="button"
        className="absolute top-0.5 right-0.5 z-10 hidden rounded-sm bg-black/70 p-0.5 text-white hover:bg-danger group-hover:block"
        title="从素材库和时间线删除该素材"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`删除「${asset.name}」？\n素材库和所有时间线中的这个素材都会被移除。`)) removeLibraryAssets([asset.id]);
        }}
      >
        <Trash2 size={10} />
      </button>
    </div>
  );
}