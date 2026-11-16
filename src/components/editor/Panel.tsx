import clsx from "clsx";
import { FolderTree, Image, Layers, ListMusic, Palette, PanelLeftClose, Captions, Type } from "lucide-react";
import { useEditor, type PanelId } from "@/store/editor";
import { MediaPanel } from "@/components/editor/panels/MediaPanel";
import { GroupsPanel } from "@/components/editor/panels/GroupsPanel";
import { TextPanel } from "@/components/editor/panels/TextPanel";
import { SubtitlesPanel } from "@/components/editor/panels/SubtitlesPanel";
import { MusicPanel } from "@/components/editor/panels/MusicPanel";
import { BrandPanel } from "@/components/editor/panels/BrandPanel";
import { TemplatesPanel } from "@/components/editor/panels/TemplatesPanel";

const TABS: { id: PanelId; label: string; icon: typeof Image }[] = [
  { id: "media", label: "素材", icon: Image },
  { id: "groups", label: "分组", icon: FolderTree },
  { id: "text", label: "文字", icon: Type },
  { id: "subtitles", label: "字幕", icon: Captions },
  { id: "music", label: "音乐", icon: ListMusic },
  { id: "brand", label: "品牌", icon: Palette },
  { id: "templates", label: "模板", icon: Layers },
];

export function Panel() {
  const panel = useEditor((s) => s.panel);
  const open = useEditor((s) => s.panelOpen);
  const setPanel = useEditor((s) => s.setPanel);
  const toggle = useEditor((s) => s.togglePanel);

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => setPanel(t.id)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-fog hover:bg-ink-4 hover:text-paper"
          >
            <t.icon size={16} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex h-10 shrink-0 items-center border-b border-line px-1">
        <div className="flex flex-1 items-center">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setPanel(t.id)}
              title={t.label}
              className={clsx(
                "flex h-10 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 text-[10px] transition-colors",
                panel === t.id ? "border-safelight text-paper" : "border-transparent text-fog hover:text-mist",
              )}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>
        <button className="ml-1 h-8 w-7 shrink-0 rounded text-fog hover:bg-ink-4 hover:text-paper" onClick={toggle} title="收起面板">
          <PanelLeftClose size={15} className="mx-auto" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === "media" && <MediaPanel />}
        {panel === "groups" && <GroupsPanel />}
        {panel === "text" && <TextPanel />}
        {panel === "subtitles" && <SubtitlesPanel />}
        {panel === "music" && <MusicPanel />}
        {panel === "brand" && <BrandPanel />}
        {panel === "templates" && <TemplatesPanel />}
      </div>
    </>
  );
}
