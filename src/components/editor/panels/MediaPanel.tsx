import { useRef, useState } from "react";
import clsx from "clsx";
import { FileVideo, Image as ImageIcon, Plus, Search, Trash2, Upload } from "lucide-react";
import type { AssetMeta } from "@/types/project";
import { useEditor } from "@/store/editor";
import { useThumb } from "@/engine/blobs";
import { addAssetsToGroup, removeLibraryAssets } from "@/components/editor/actions";
import { addFilesToProject } from "@/lib/projects";
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
  const inputRef = useRef<HTMLInputElement>(null);

  const list = project.library.map((id) => assets[id]).filter((a): a is AssetMeta => !!a && a.kind !== "audio");
  const filtered = filter ? list.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase())) : list;
  const used = new Set(project.groups.flatMap((g) => g.clips.map((c) => c.assetId)));
  const activeGroup = project.groups.find((g) => g.id === activeGroupId);

  const importFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy({ done: 0, total: files.length, name: "" });
    try {
      const res = await addFilesToProject(files, {
        groupId: activeGroupId,
        onProgress: (done, total, name) => setBusy({ done, total, name }),
      });
      if (res.added.length) toast(`已导入 ${res.added.length} 个素材${activeGroup ? `到「${activeGroup.name}」` : ""}`, "success");
      for (const e of res.errors) toast(e, "error", 5000);
    } finally {
      setBusy(null);
    }
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
          <span>导入到：</span>
          <select
            className="h-6 max-w-[170px] rounded border border-line bg-ink-1 px-1 text-[11px] text-mist"
            value={activeGroupId ?? ""}
            onChange={(e) => setActiveGroup(e.target.value || null)}
          >
            {project.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name || "未命名"}
              </option>
            ))}
          </select>
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
        双击素材添加到当前分组；也可以直接拖到画面上或时间线里。带橙色「新」标记的是还没用过的素材。
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
      onDragStart={(e) => e.dataTransfer.setData("text/clipmill-asset", asset.id)}
      onDoubleClick={onAdd}
      title={`${asset.name}\n双击添加到当前分组`}
    >
      {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" /> : <div className="h-full w-full" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pt-3 pb-0.5">
        <div className="truncate text-[9.5px] text-paper/90">{asset.name}</div>
      </div>
      <div className="absolute top-0.5 left-0.5 flex gap-0.5">
        {asset.kind === "video" ? (
          <span className="rounded-sm bg-black/70 px-1 font-mono text-[9px] text-white">
            <FileVideo size={9} className="mr-0.5 inline" />
            {formatDuration(asset.duration)}
          </span>
        ) : null}
      </div>
      {!used && <span className="absolute top-0.5 right-0.5 rounded-sm bg-amber px-1 text-[9px] font-medium text-black">新</span>}
      <button
        className="absolute top-0.5 right-0.5 hidden rounded-sm bg-black/70 p-0.5 text-white hover:bg-danger group-hover:block"
        title="从素材库和时间线删除该素材"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`删除「${asset.name}」？\n素材库和所有时间线中的这个素材都会被移除。`)) removeLibraryAssets([asset.id]);
        }}
      >
        <Trash2 size={10} />
      </button>
      <button
        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onAdd}
        title="添加到当前分组"
      >
        <Plus size={18} className="text-white" />
      </button>
    </div>
  );
}
