import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Clapperboard,
  Copy,
  Film,
  FolderOpen,
  HardDrive,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { ProjectSummary, StylePreset } from "@/types/project";
import { deletePreset, deleteProject, listPresets, listSummaries, savePreset, storageEstimate } from "@/db";
import { createNewProject, createSampleProject, duplicateProject, openProject, renameProject } from "@/lib/projects";
import { useThumb } from "@/engine/blobs";
import { Button, IconButton, Select, TextInput } from "@/components/ui/controls";
import { GithubIcon, Modal, Wordmark, toast } from "@/components/ui/feedback";
import { capabilityWarning, detectCapabilities } from "@/lib/capabilities";
import { formatBytes, formatDuration } from "@/lib/util";

const REPO_URL = "https://github.com/unkaku-1/clipmill";

function Cover({ assetId }: { assetId: string | null }) {
  const url = useThumb(assetId);
  return url ? (
    <img src={url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" draggable={false} />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-ink-3 text-fog/50">
      <Film size={28} />
    </div>
  );
}

function timeAgo(ts: number) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "刚刚";
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState<string>("__default");
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [renameText, setRenameText] = useState("");
  const [storage, setStorage] = useState<{ usage?: number; quota?: number } | null>(null);
  const caps = useMemo(detectCapabilities, []);
  const warning = capabilityWarning(caps);

  const refresh = async () => {
    const [p, m] = await Promise.all([listSummaries(), listPresets()]);
    setProjects(p);
    setPresets(m);
    setStorage(await storageEstimate());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const open = async (id: string) => {
    setBusy("正在打开工程…");
    const ok = await openProject(id);
    setBusy(null);
    if (!ok) toast("工程打开失败", "error");
  };

  const create = async () => {
    const name = newName.trim() || `${new Date().getMonth() + 1}月视频`;
    const preset = newPreset === "__default" ? presets.find((p) => p.isDefault) : presets.find((p) => p.id === newPreset);
    setNewOpen(false);
    const id = await createNewProject(name, newPreset === "__blank" ? null : preset);
    await open(id);
  };

  const sample = async () => {
    try {
      setBusy("正在准备示例工程…");
      const id = await createSampleProject((m) => setBusy(m));
      await open(id);
    } catch (e) {
      setBusy(null);
      toast(`示例工程创建失败：${e instanceof Error ? e.message : e}`, "error");
    }
  };

  const defaultPreset = presets.find((p) => p.isDefault);

  return (
    <div className="noise relative h-full overflow-y-auto">
      {/* Masthead */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line/70 bg-ink-1/85 px-8 backdrop-blur">
        <Wordmark />
        <div className="flex items-center gap-3 text-xs text-fog">
          {storage?.usage !== undefined && (
            <span className="flex items-center gap-1.5" title="素材只保存在这台电脑的浏览器里">
              <HardDrive size={13} />
              本地已用 {formatBytes(storage.usage)}
              {storage.quota ? ` / ${formatBytes(storage.quota)}` : ""}
            </span>
          )}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-ink-4 hover:text-paper">
            <GithubIcon size={14} /> 开源仓库
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)_340px] gap-10 px-8 pt-10 pb-16">
        <main className="min-w-0">
          {/* Hero: asymmetric, left aligned */}
          <section className="relative mb-10 overflow-hidden rounded-2xl border border-line bg-ink-2">
            <div className="film-edge" />
            <div className="grid grid-cols-[1.25fr_1fr] gap-8 px-9 py-9">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-safelight/40 bg-safelight/10 px-2.5 py-0.5 text-[11px] font-medium text-safelight">
                  <span className="h-1.5 w-1.5 rounded-full bg-safelight" /> 设置一次，每期准时出片
                </div>
                <h1 className="mb-3 text-[34px] leading-[1.15] font-bold tracking-tight">
                  拖进照片，
                  <br />
                  剩下的交给流水线。
                </h1>
                <p className="max-w-[460px] text-[13.5px] leading-relaxed text-mist">
                  片头片尾、Logo、主题大标题、分组小标题、双语字幕都已就位。你只管分组和讲故事，导出 60 帧 1080P / 4K。
                </p>
                <div className="mt-6 flex gap-2.5">
                  <Button variant="primary" size="lg" onClick={() => setNewOpen(true)}>
                    <Plus size={16} /> 新建工程
                  </Button>
                  <Button variant="outline" size="lg" onClick={sample}>
                    <Sparkles size={15} /> 打开示例工程
                  </Button>
                </div>
              </div>
              <ol className="space-y-2.5 self-center text-[13px]">
                {[
                  ["品牌套件", "Logo、片头片尾、配色，存成「模式」反复用"],
                  ["导入分组", "照片和视频按主题分组，小标题自动跟随"],
                  ["一键成片", "随机过渡 + 运镜 + 适配音乐时长"],
                  ["导出", "60 帧 1080P / 4K MP4，直接写入硬盘"],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3 rounded-lg border border-line/60 bg-ink-1/60 px-3.5 py-2.5">
                    <span className="font-mono text-xs text-safelight">0{i + 1}</span>
                    <span>
                      <span className="font-medium text-paper">{t}</span>
                      <span className="ml-2 text-fog">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="film-edge" />
          </section>

          {warning && (
            <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] text-amber">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">{warning}</div>
                <div className="mt-0.5 text-xs text-amber/80">编辑和预览仍可使用；导出视频需要满足上述条件。</div>
              </div>
            </div>
          )}

          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-[11px] font-semibold tracking-[0.14em] text-fog uppercase">最近的工程</h2>
            {projects && projects.length > 0 && <span className="text-xs text-fog">{projects.length} 个工程</span>}
          </div>

          {projects === null ? (
            <div className="h-40" />
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
              <Clapperboard size={30} className="text-fog/60" />
              <div className="text-sm text-mist">还没有工程</div>
              <div className="text-xs text-fog">先打开示例工程看看效果，或者直接新建一个。</div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
              {projects.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-xl border border-line bg-ink-2 transition-[border,transform] duration-150 hover:-translate-y-0.5 hover:border-ink-5">
                  <button className="block aspect-video w-full overflow-hidden" onClick={() => open(p.id)}>
                    <Cover assetId={p.coverAssetId} />
                  </button>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button className="min-w-0 flex-1 text-left" onClick={() => open(p.id)}>
                      <div className="truncate text-[13px] font-medium">{p.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-fog">
                        {formatDuration(p.duration)} · {p.clipCount} 个镜头 · {timeAgo(p.updatedAt)}
                      </div>
                    </button>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton
                        label="重命名"
                        onClick={() => {
                          setRenaming(p);
                          setRenameText(p.name);
                        }}
                      >
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        label="复制工程"
                        onClick={async () => {
                          await duplicateProject(p.id);
                          await refresh();
                          toast("已复制", "success");
                        }}
                      >
                        <Copy size={14} />
                      </IconButton>
                      <IconButton
                        label="删除工程"
                        onClick={async () => {
                          if (!confirm(`删除工程「${p.name}」？素材会一并清理，无法恢复。`)) return;
                          await deleteProject(p.id);
                          await refresh();
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Side: modes */}
        <aside className="space-y-6">
          <div className="rounded-xl border border-line bg-ink-2">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Layers size={15} className="text-safelight" />
              <div className="text-[13px] font-semibold">模式（品牌套件）</div>
            </div>
            <div className="px-4 py-3 text-xs leading-relaxed text-fog">
              在编辑器的「品牌」面板里点「保存为模式」，即可把 Logo、片头片尾、字幕和小标题样式存下来。设为默认后，新建工程会自动套用。
            </div>
            {presets.length === 0 ? (
              <div className="px-4 pb-4 text-xs text-fog/70">暂无模式</div>
            ) : (
              <ul className="px-2 pb-2">
                {presets.map((m) => (
                  <li key={m.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-3">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m.style.brand.primary }} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{m.name}</span>
                    {m.isDefault && <span className="text-[11px] text-safelight">默认</span>}
                    <IconButton
                      label={m.isDefault ? "已是默认" : "设为默认"}
                      className="h-6 w-6"
                      onClick={async () => {
                        await savePreset({ ...m, isDefault: !m.isDefault });
                        await refresh();
                      }}
                    >
                      <Star size={13} className={clsx(m.isDefault && "fill-safelight text-safelight")} />
                    </IconButton>
                    <IconButton
                      label="删除模式"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={async () => {
                        if (!confirm(`删除模式「${m.name}」？`)) return;
                        await deletePreset(m.id);
                        await refresh();
                      }}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-line bg-ink-2 px-4 py-3.5 text-xs leading-relaxed text-fog">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-paper">
              <FolderOpen size={15} className="text-amber" /> 数据保存在哪？
            </div>
            所有照片、视频和工程都只存在这台电脑的浏览器（IndexedDB）里，不会上传到任何服务器。换电脑或清理浏览器数据前，请先导出成片。
          </div>

          <div className="rounded-xl border border-line bg-ink-2 px-4 py-3.5 text-xs text-fog">
            <div className="mb-2 text-[13px] font-semibold text-paper">运行环境</div>
            <ul className="space-y-1 font-mono text-[11px]">
              <li>浏览器：{caps.browser}</li>
              <li className={caps.secure ? "text-moss" : "text-amber"}>安全连接：{caps.secure ? "是" : "否"}</li>
              <li className={caps.webcodecs ? "text-moss" : "text-amber"}>WebCodecs 编码：{caps.webcodecs ? "可用" : "不可用"}</li>
              <li className={caps.fileSystem ? "text-moss" : "text-fog"}>直接写入硬盘：{caps.fileSystem ? "可用" : "不可用（将在内存中生成）"}</li>
            </ul>
          </div>
        </aside>
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="新建工程"
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={create}>
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-4 p-4">
          <div>
            <div className="mb-1 text-xs text-fog">工程名称</div>
            <TextInput value={newName} onChange={setNewName} placeholder={`${new Date().getMonth() + 1}月视频`} />
          </div>
          <div>
            <div className="mb-1 text-xs text-fog">使用模式</div>
            <Select
              value={newPreset}
              onChange={setNewPreset}
              options={[
                { id: "__default", label: defaultPreset ? `默认模式：${defaultPreset.name}` : "默认样式（ClipMill）" },
                { id: "__blank", label: "空白样式（ClipMill 默认）" },
                ...presets.map((p) => ({ id: p.id, label: p.name })),
              ]}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="重命名工程"
        width={400}
        footer={
          <Button
            variant="primary"
            onClick={async () => {
              if (renaming) await renameProject(renaming.id, renameText.trim() || renaming.name);
              setRenaming(null);
              await refresh();
            }}
          >
            保存
          </Button>
        }
      >
        <div className="p-4">
          <TextInput value={renameText} onChange={setRenameText} />
        </div>
      </Modal>

      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[320px] rounded-xl border border-line bg-ink-2 px-5 py-4">
            <div className="mb-3 text-[13px] text-mist">{busy}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-4">
              <div className="develop-bar h-full w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
