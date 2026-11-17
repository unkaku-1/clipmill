import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Check, Download, Layers, LoaderCircle, Settings2, TriangleAlert, WandSparkles } from "lucide-react";
import { useEditor, useLayout } from "@/store/editor";
import { transport } from "@/engine/transport";
import { leaveEditor } from "@/lib/projects";
import { detectCapabilities, capabilityWarning } from "@/lib/capabilities";
import { Button, IconButton } from "@/components/ui/controls";
import { Modal, Wordmark, toast } from "@/components/ui/feedback";
import { Panel } from "@/components/editor/Panel";
import { Inspector } from "@/components/editor/Inspector";
import { Stage } from "@/components/editor/Stage";
import { DEFAULT_PANE_LAYOUT, LEFT_MAX, LEFT_MIN, RIGHT_MAX, RIGHT_MIN, TIMELINE_MIN, Splitter, usePaneLayout } from "@/components/editor/Splitter";
import { Timeline } from "@/components/timeline/Timeline";
import { useDialogs } from "@/components/editor/dialogs";
import { ExportDialog, OneClickDialog, SubtitlesDialog } from "@/components/editor/Dialogs";
import { useEditorShortcuts } from "@/components/editor/shortcuts";
import { buildFontTasks, preloadProjectFonts } from "@/lib/preload";

export function Editor() {
  const project = useEditor((s) => s.project)!;
  const layout = useLayout()!;
  const panelOpen = useEditor((s) => s.panelOpen);
  const setPanel = useEditor((s) => s.setPanel);
  const panel = useEditor((s) => s.panel);
  const saveState = useEditor((s) => s.saveState);
  const exporting = useEditor((s) => s.exporting);
  const dialog = useDialogs((s) => s.dialog);
  const openDialog = useDialogs((s) => s.open);
  const closeDialog = useDialogs((s) => s.close);
  const saveRef = useRef<HTMLSpanElement>(null);
  // Resizable chrome: widths are persisted, the timeline keeps its natural
  // height until the user drags the divider (then double click restores it).
  const { layout: pane, setLayout: setPane } = usePaneLayout();
  const [timelineAuto, setTimelineAuto] = useState(300);
  const tlMax = Math.max(TIMELINE_MIN + 80, Math.round((typeof window === "undefined" ? 900 : window.innerHeight) * 0.62));

  const caps = useMemo(detectCapabilities, []);
  const warning = capabilityWarning(caps);
  const textCount = project.texts.length + project.groups.length + project.subtitles.top.length + project.subtitles.bottom.length;

  useEditorShortcuts();

  // Keep the transport in sync with the computed duration.
  useEffect(() => {
    transport.setDuration(layout.duration);
  }, [layout.duration]);

  // Pause playback when the project changes identity or the tab is hidden.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) transport.pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Load glyphs for everything that can appear in the video (cached after first use).
  useEffect(() => {
    let alive = true;
    const run = async () => {
      for (const batch of buildFontTasks(project)) {
        if (!alive) return;
        await preloadProjectFonts(batch);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [project]);

  const saveLabel = saveState === "pending" ? "保存中…" : saveState === "error" ? "保存失败" : saveState === "saved" ? "已自动保存" : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-1">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-ink-1 px-3">
        <IconButton label="返回工程列表" onClick={() => void leaveEditor()}>
          <ArrowLeft size={17} />
        </IconButton>
        <div className="flex items-center gap-3 border-l border-line pl-3">
          <Wordmark />
          <ProjectName />
        </div>
        <div className="ml-2 flex items-center gap-1.5 text-[11px] text-fog">
          <span ref={saveRef} className={clsx("flex items-center gap-1", saveState === "error" && "text-danger")}>
            {saveState === "pending" ? <LoaderCircle size={12} className="animate-spin" /> : saveState === "saved" ? <Check size={12} className="text-moss" /> : null}
            {saveLabel}
          </span>
        </div>
        <div className="flex-1" />
        {warning && (
          <div className="hidden items-center gap-1.5 rounded-md border border-amber/40 bg-amber/10 px-2 py-1 text-[11px] text-amber lg:flex" title={warning}>
            <TriangleAlert size={12} /> 导出不可用
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" onClick={() => setPanel("templates")} className={clsx(panel === "templates" && panelOpen && "bg-ink-4 text-paper")}>
            <Settings2 size={15} /> 模板
          </Button>
          <Button variant="subtle" onClick={() => openDialog("subtitles")}>
            <Layers size={15} /> 字幕 <span className="font-mono text-[11px] text-fog">{project.subtitles.top.length + project.subtitles.bottom.length || ""}</span>
          </Button>
          <Button variant="subtle" onClick={() => openDialog("oneclick")}>
            <WandSparkles size={15} /> 一键成片
          </Button>
          <Button
            variant="primary"
            disabled={!layout.duration || exporting}
            onClick={() => {
              if (warning) {
                toast(warning, "error", 6000);
                return;
              }
              openDialog("export");
            }}
          >
            <Download size={15} /> 导出
          </Button>
        </div>
      </header>

      {/* Main */}
      <div className="flex min-h-0 flex-1">
        <aside style={{ width: panelOpen ? pane.left : 48 }} className="flex shrink-0 flex-col overflow-hidden border-r border-line bg-ink-2">
          <Panel />
        </aside>
        {panelOpen && (
          <Splitter
            orientation="vertical"
            value={pane.left}
            min={LEFT_MIN}
            max={LEFT_MAX}
            onChange={(v) => setPane((p) => ({ ...p, left: v }))}
            onReset={() => setPane((p) => ({ ...p, left: DEFAULT_PANE_LAYOUT.left }))}
            title="拖动调整素材面板宽度 · 双击重置"
          />
        )}
        <main className="relative flex min-w-0 flex-1 flex-col bg-ink-1">
          <Stage />
        </main>
        {panelOpen && (
          <>
            <Splitter
              orientation="vertical"
              invert
              value={pane.right}
              min={RIGHT_MIN}
              max={RIGHT_MAX}
              onChange={(v) => setPane((p) => ({ ...p, right: v }))}
              onReset={() => setPane((p) => ({ ...p, right: DEFAULT_PANE_LAYOUT.right }))}
              title="拖动调整属性面板宽度 · 双击重置"
            />
            <aside
              style={{ width: pane.right }}
              className="flex shrink-0 flex-col overflow-x-hidden overflow-y-auto overscroll-contain border-l border-line bg-ink-2 [scrollbar-gutter:stable]"
            >
              <Inspector />
            </aside>
          </>
        )}
      </div>

      {/* Timeline: drag the divider to resize, double click for the natural height */}
      <Splitter
        orientation="horizontal"
        invert
        value={pane.timeline ?? timelineAuto}
        min={TIMELINE_MIN}
        max={tlMax}
        onChange={(v) => setPane((p) => ({ ...p, timeline: v }))}
        onReset={() => setPane((p) => ({ ...p, timeline: null }))}
        title="拖动调整时间线高度 · 双击回到自适应"
      />
      <Timeline height={pane.timeline} onHeightChange={setTimelineAuto} />

      {/* Dialogs */}
      <Modal open={dialog === "export"} onClose={() => !exporting && closeDialog()} title="导出视频" width={560} dismissable={!exporting}>
        <ExportDialog onDone={closeDialog} />
      </Modal>
      <Modal open={dialog === "subtitles"} onClose={closeDialog} title="字幕" width={860}>
        <SubtitlesDialog onDone={closeDialog} textCount={textCount} />
      </Modal>
      <Modal open={dialog === "oneclick"} onClose={closeDialog} title="一键成片" width={480}>
        <OneClickDialog onDone={closeDialog} />
      </Modal>
    </div>
  );
}

function ProjectName() {
  const name = useEditor((s) => s.project?.name ?? "");
  const update = useEditor((s) => s.update);
  return (
    <input
      key={name}
      defaultValue={name}
      className="h-7 w-[240px] rounded-md border border-transparent bg-transparent px-2 text-[13px] font-medium text-mist outline-none hover:border-line focus:border-safelight/60 focus:bg-ink-2 focus:text-paper"
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v && v !== name) update((d) => void (d.name = v));
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
