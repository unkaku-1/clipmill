import { useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Scissors, Trash2 } from "lucide-react";
import type { MotionType, TransitionType } from "@/types/project";
import { useEditor, useLayout, findClip } from "@/store/editor";
import { transport } from "@/engine/transport";
import { MOTIONS, TITLE_TEMPLATES, TRANSITIONS } from "@/engine/catalog";
import { moveClipBy, removeClips, splitClipAt, updateGroup } from "@/components/editor/actions";
import { Button, Field, NumberInput, Section, Segmented, Select, TextArea, TextInput, Toggle } from "@/components/ui/controls";
import { toast } from "@/components/ui/feedback";
import { TextStyleEditor } from "@/components/editor/TextStyleEditor";
import { DESIGN_H, DESIGN_W, formatTimecode, uid } from "@/lib/util";
import { createGroup } from "@/lib/defaults";

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project)!;
  if (!selection) return <ProjectInspector />;
  switch (selection.kind) {
    case "clip":
      return <ClipInspector id={selection.id} />;
    case "group":
      return <GroupInspector id={selection.id} />;
    case "text":
      return <TextInspector id={selection.id} />;
    case "cue-top":
    case "cue-bottom":
      return <CueInspector id={selection.id} track={selection.kind === "cue-top" ? "top" : "bottom"} />;
    case "audio":
      return <AudioInspector id={selection.id} />;
    case "intro":
    case "outro":
      return <BookendInspector which={selection.kind} />;
    case "title":
      return <TitleInspector />;
    case "logo":
      return <LogoInspector />;
    case "caption":
      return <CaptionInspector groupId={selection.id} />;
    case "sub-top":
      return <SubtitleStyleInspector track="top" />;
    case "sub-bottom":
      return <SubtitleStyleInspector track="bottom" />;
    default:
      void project;
      return <ProjectInspector />;
  }
}

function Header({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b border-line bg-ink-2 px-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold">{title}</div>
        {subtitle && <div className="truncate font-mono text-[10px] text-fog">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function ProjectInspector() {
  const project = useEditor((s) => s.project)!;
  const layout = useLayout()!;
  const update = useEditor((s) => s.update);
  return (
    <div>
      <Header title="工程" subtitle={`${formatTimecode(layout.duration)} · ${layout.clips.length} 个镜头`} />
      <Section title="主题">
        <Field label="主标题" inline={false}>
          <TextInput value={project.title.title} onChange={(v) => update((d) => void (d.title.title = v), { coalesce: "p-title" })} />
        </Field>
        <Field label="副标题" inline={false}>
          <TextArea value={project.title.subtitle} onChange={(v) => update((d) => void (d.title.subtitle = v))} rows={2} />
        </Field>
      </Section>
      <Section title="结构">
        <div className="space-y-1 font-mono text-[11px] text-fog">
          <div className="flex justify-between"><span>片头</span><span>{project.style.brand.intro.mode === "none" ? "无" : formatTimecode(project.style.brand.intro.duration, false)}</span></div>
          <div className="flex justify-between"><span>主题标题</span><span>{project.style.title.enabled ? formatTimecode(project.style.title.duration, false) : "无"}</span></div>
          <div className="flex justify-between"><span>素材</span><span>{layout.clips.length} 个 · {project.groups.length} 组</span></div>
          <div className="flex justify-between"><span>片尾</span><span>{project.style.brand.outro.mode === "none" ? "无" : formatTimecode(project.style.brand.outro.duration, false)}</span></div>
        </div>
      </Section>
      <div className="px-3 py-3 text-[11px] leading-relaxed text-fog">
        在画面上点击文字、小标题或 Logo 可直接拖动；在时间线上拖动素材排序，拖素材两端改时长。
      </div>
    </div>
  );
}

function ClipInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project)!;
  const assets = useEditor((s) => s.assets);
  const layout = useLayout()!;
  const update = useEditor((s) => s.update);
  const found = findClip(project, id);
  if (!found) return <ProjectInspector />;
  const { clip, group } = found;
  const asset = assets[clip.assetId];
  const seg = layout.byKey.get(id);
  const isVideo = asset?.kind === "video";

  const patch = (fn: (c: NonNullable<typeof clip>) => void, coalesce?: string) =>
    update((d) => {
      for (const g of d.groups) {
        const c = g.clips.find((x) => x.id === id);
        if (c) {
          fn(c);
          return;
        }
      }
    }, { coalesce, history: !coalesce });

  return (
    <div>
      <Header title={asset?.name ?? "素材"} subtitle={seg ? `${formatTimecode(seg.start)} → ${formatTimecode(seg.end)}` : ""}>
        <button className="rounded p-1 text-fog hover:bg-ink-4 hover:text-paper" title="复制镜头 (Ctrl+D)" onClick={() => {
          update((d) => {
            for (const g of d.groups) {
              const i = g.clips.findIndex((c) => c.id === id);
              if (i >= 0) {
                const copy = structuredClone(g.clips[i]);
                copy.id = uid("c");
                g.clips.splice(i + 1, 0, copy);
              }
            }
          });
        }}>
          <Copy size={14} />
        </button>
        <button className="rounded p-1 text-fog hover:bg-ink-4 hover:text-paper" title="在播放头处拆分" onClick={() => splitClipAt(id, transport.time)}>
          <Scissors size={14} />
        </button>
        <button className="rounded p-1 text-fog hover:text-[#ff8b8f]" title="删除" onClick={() => removeClips([id])}>
          <Trash2 size={14} />
        </button>
      </Header>
      <Section title="时长">
        <Field label="时长">
          <NumberInput value={clip.duration} min={0.3} max={isVideo ? Math.max(0.3, (asset?.duration ?? 0) - clip.trimIn) : 60} step={0.05} unit="s" slider onChange={(v) => patch((c) => void (c.duration = v), "clip-dur")} />
        </Field>
        {isVideo && (
          <Field label="起点">
            <NumberInput value={clip.trimIn} min={0} max={Math.max(0, (asset?.duration ?? 0) - 0.3)} step={0.05} unit="s" slider onChange={(v) => patch((c) => void (c.trimIn = v), "clip-trim")} />
          </Field>
        )}
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => moveClipBy(id, -1)} title="往前移一位">
            <ArrowLeft size={12} /> 前移
          </Button>
          <Button size="sm" variant="ghost" onClick={() => moveClipBy(id, 1)} title="往后移一位">
            后移 <ArrowRight size={12} />
          </Button>
        </div>
      </Section>
      <Section title="过渡（进入本镜头）">
        <Field label="效果">
          <Select value={clip.transition.type} onChange={(v) => patch((c) => void (c.transition.type = v as TransitionType))} options={TRANSITIONS.map((t) => ({ id: t.id, label: t.label }))} />
        </Field>
        <Field label="时长">
          <NumberInput value={clip.transition.duration} min={0.05} max={1.5} step={0.05} unit="s" slider onChange={(v) => patch((c) => void (c.transition.duration = v), "clip-trans")} />
        </Field>
      </Section>
      <Section title="画面">
        <Field label="运镜">
          <Select value={clip.motion} onChange={(v) => patch((c) => void (c.motion = v as MotionType))} options={MOTIONS.map((m) => ({ id: m.id, label: m.label }))} />
        </Field>
        <Field label="填充">
          <Segmented
            value={clip.fit}
            onChange={(v) => patch((c) => void (c.fit = v))}
            options={[
              { id: "cover", label: "铺满（裁切）" },
              { id: "contain", label: "完整（留边）" },
            ]}
          />
        </Field>
        {isVideo && asset?.hasAudio && (
          <>
            <Field label="原声">
              <NumberInput value={clip.volume} min={0} max={1} step={0.05} digits={2} slider onChange={(v) => patch((c) => void (c.volume = v), "clip-vol")} />
            </Field>
            <Toggle checked={clip.muted} onChange={(v) => patch((c) => void (c.muted = v))} label="静音" />
          </>
        )}
      </Section>
      <Section title="所属分组">
        <Field label="分组">
          <Select
            value={group.id}
            onChange={(v) => update((d) => {
              let c: typeof clip | null = null;
              for (const g of d.groups) {
                const i = g.clips.findIndex((x) => x.id === id);
                if (i >= 0) c = g.clips.splice(i, 1)[0];
              }
              const target = d.groups.find((g) => g.id === v);
              if (c && target) target.clips.push(c);
            })}
            options={project.groups.map((g) => ({ id: g.id, label: g.name || "未命名" }))}
          />
        </Field>
      </Section>
    </div>
  );
}

function GroupInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const group = project.groups.find((g) => g.id === id);
  const layout = useLayout()!;
  if (!group) return <ProjectInspector />;
  const run = layout.captionRuns.find((r) => r.group.id === id);
  return (
    <div>
      <Header title="分组" subtitle={`${group.clips.length} 个素材`} />
      <Section title="主题">
        <Field label="名称" inline={false}>
          <TextInput value={group.name} onChange={(v) => update((d) => updateGroup(d, id, (g) => void (g.name = v)), { coalesce: `gname-${id}` })} />
        </Field>
        <Field label="颜色">
          <input type="color" value={group.color} onChange={(e) => update((d) => updateGroup(d, id, (g) => void (g.color = e.target.value.toUpperCase())), { coalesce: `gcolor-${id}` })} className="h-7 w-full cursor-pointer rounded border border-line bg-ink-1" />
        </Field>
        <Toggle checked={group.showCaption} onChange={(v) => update((d) => updateGroup(d, id, (g) => void (g.showCaption = v)))} label="显示分组小标题" />
      </Section>
      <Section title="小标题位置">
        <div className="text-[11px] leading-relaxed text-fog">
          在画面上拖动小标题即可调整，只影响本组。
        </div>
        <Field label="X">
          <NumberInput value={(group.captionPos ?? project.style.caption.pos).x} min={0} max={DESIGN_W} step={1} slider onChange={(v) => update((d) => updateGroup(d, id, (g) => void (g.captionPos = { x: v, y: (g.captionPos ?? d.style.caption.pos).y })), { history: false, coalesce: `gx-${id}` })} />
        </Field>
        <Field label="Y">
          <NumberInput value={(group.captionPos ?? project.style.caption.pos).y} min={0} max={DESIGN_H} step={1} slider onChange={(v) => update((d) => updateGroup(d, id, (g) => void (g.captionPos = { x: (g.captionPos ?? d.style.caption.pos).x, y: v })), { history: false, coalesce: `gy-${id}` })} />
        </Field>
        {group.captionPos && (
          <Button size="sm" variant="ghost" onClick={() => update((d) => updateGroup(d, id, (g) => void (g.captionPos = null)))}>
            恢复默认位置
          </Button>
        )}
        {run && <div className="font-mono text-[10px] text-fog">显示 {formatTimecode(run.start, false)} → {formatTimecode(run.end, false)}</div>}
      </Section>
      <Section title="小标题样式（本组覆盖）" defaultOpen={false}>
        <div className="text-[11px] text-fog">样式在「模板 → 分组小标题」统一设置。</div>
      </Section>
    </div>
  );
}

function TextInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const item = project.texts.find((t) => t.id === id);
  if (!item) return <ProjectInspector />;
  const patch = (fn: (t: NonNullable<typeof item>) => void, coalesce?: string) =>
    update((d) => {
      const t = d.texts.find((x) => x.id === id);
      if (t) fn(t);
    }, { coalesce, history: !coalesce });
  return (
    <div>
      <Header title="自定义文字" subtitle={`${formatTimecode(item.start, false)} · ${item.duration.toFixed(1)}s`}>
        <button className="rounded p-1 text-fog hover:text-[#ff8b8f]" onClick={() => {
          update((d) => void (d.texts = d.texts.filter((t) => t.id !== id)));
          useEditor.getState().select(null);
        }}>
          <Trash2 size={14} />
        </button>
      </Header>
      <Section title="内容">
        <TextArea value={item.text} onChange={(v) => patch((t) => void (t.text = v))} rows={2} />
      </Section>
      <Section title="时间">
        <Field label="开始">
          <NumberInput value={item.start} min={0} step={0.1} unit="s" onChange={(v) => patch((t) => void (t.start = v), "tx-start")} />
        </Field>
        <Field label="时长">
          <NumberInput value={item.duration} min={0.3} max={60} step={0.1} unit="s" slider onChange={(v) => patch((t) => void (t.duration = v), "tx-dur")} />
        </Field>
      </Section>
      <Section title="位置">
        <Field label="X">
          <NumberInput value={item.pos.x} min={0} max={DESIGN_W} step={1} slider onChange={(v) => patch((t) => void (t.pos = { ...t.pos, x: v }), "tx-x")} />
        </Field>
        <Field label="Y">
          <NumberInput value={item.pos.y} min={0} max={DESIGN_H} step={1} slider onChange={(v) => patch((t) => void (t.pos = { ...t.pos, y: v }), "tx-y")} />
        </Field>
        <div className="flex gap-1">
          {[
            ["左上", { x: 140, y: 110 }, <ArrowLeft key="a" size={11} />],
            ["右上", { x: 1780, y: 110 }, <ArrowRight key="b" size={11} />],
            ["左下", { x: 140, y: 940 }, <ArrowDown key="c" size={11} />],
            ["右下", { x: 1780, y: 940 }, <ArrowUp key="d" size={11} />],
          ].map(([label, pos]) => (
            <Button key={label as string} size="sm" variant="ghost" onClick={() => patch((t) => void (t.pos = { ...(pos as { x: number; y: number }) }))}>
              {label as string}
            </Button>
          ))}
        </div>
      </Section>
      <Section title="样式">
        <TextStyleEditor
          style={item.style}
          anim={item.anim}
          previewText={item.text}
          onChange={(p, c) => patch((t) => Object.assign(t.style, p), c)}
          onAnimChange={(p) => patch((t) => Object.assign(t.anim, p))}
        />
      </Section>
    </div>
  );
}

function CueInspector({ id, track }: { id: string; track: "top" | "bottom" }) {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const cue = project.subtitles[track].find((c) => c.id === id);
  if (!cue) return <ProjectInspector />;
  const patch = (fn: (c: NonNullable<typeof cue>) => void, coalesce?: string) =>
    update((d) => {
      const c = (track === "top" ? d.subtitles.top : d.subtitles.bottom).find((x) => x.id === id);
      if (c) fn(c);
    }, { coalesce, history: !coalesce });
  return (
    <div>
      <Header title={track === "top" ? "顶部字幕" : "底部字幕"} subtitle={`${formatTimecode(cue.start, false)} → ${formatTimecode(cue.end, false)}`} />
      <Section title="内容">
        <TextArea value={cue.text} onChange={(v) => patch((c) => void (c.text = v))} rows={3} />
      </Section>
      <Section title="时间">
        <Field label="开始">
          <NumberInput value={cue.start} min={0} step={0.05} unit="s" onChange={(v) => patch((c) => void (c.start = Math.min(v, c.end - 0.1)), "cue-start")} />
        </Field>
        <Field label="结束">
          <NumberInput value={cue.end} min={cue.start + 0.1} step={0.05} unit="s" onChange={(v) => patch((c) => void (c.end = Math.max(v, c.start + 0.1)), "cue-end")} />
        </Field>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => update((d) => {
            const arr = track === "top" ? d.subtitles.top : d.subtitles.bottom;
            const src = arr.find((c) => c.id === id);
            const other = track === "top" ? d.subtitles.bottom : d.subtitles.top;
            if (!src) return;
            const lines = src.text.split("\n");
            if (lines.length < 2) {
              toast("这条字幕只有一行，无法拆分", "info");
              return;
            }
            src.text = lines[0];
            other.push({ id: uid("s"), start: src.start, end: src.end, text: lines.slice(1).join("\n") });
            other.sort((a, b) => a.start - b.start);
          })}>
            拆一行到{track === "top" ? "底部" : "顶部"}
          </Button>
        </div>
      </Section>
      <Section title="样式">
        <TextStyleEditor
          style={(track === "top" ? project.style.subtitleTop : project.style.subtitleBottom).style}
          previewText={cue.text}
          onChange={(p, c) => update((d) => {
            const s = track === "top" ? d.style.subtitleTop.style : d.style.subtitleBottom.style;
            Object.assign(s, p);
          }, { coalesce: c })}
        />
      </Section>
    </div>
  );
}

function AudioInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project)!;
  const assets = useEditor((s) => s.assets);
  const update = useEditor((s) => s.update);
  const a = project.audio.find((x) => x.id === id);
  if (!a) return <ProjectInspector />;
  const asset = assets[a.assetId];
  const patch = (fn: (x: NonNullable<typeof a>) => void, coalesce?: string) =>
    update((d) => {
      const x = d.audio.find((y) => y.id === id);
      if (x) fn(x);
    }, { coalesce, history: !coalesce });
  return (
    <div>
      <Header title={asset?.name ?? "音乐"} subtitle={asset ? `${asset.duration.toFixed(1)}s` : ""} />
      <Section title="播放">
        <Field label="开始">
          <NumberInput value={a.start} min={0} step={0.1} unit="s" onChange={(v) => patch((x) => void (x.start = v), "au-start")} />
        </Field>
        <Field label="时长">
          <NumberInput value={a.duration} min={0.5} max={asset?.duration ?? 600} step={0.1} unit="s" slider onChange={(v) => patch((x) => void (x.duration = v), "au-dur")} />
        </Field>
        <Field label="裁剪起点">
          <NumberInput value={a.trimIn} min={0} max={Math.max(0, (asset?.duration ?? 0) - 0.5)} step={0.1} unit="s" onChange={(v) => patch((x) => void (x.trimIn = v), "au-trim")} />
        </Field>
        <Field label="音量">
          <NumberInput value={a.volume} min={0} max={1} step={0.05} digits={2} slider onChange={(v) => patch((x) => void (x.volume = v), "au-vol")} />
        </Field>
        <Field label="淡入">
          <NumberInput value={a.fadeIn} min={0} max={10} step={0.1} unit="s" onChange={(v) => patch((x) => void (x.fadeIn = v), "au-fi")} />
        </Field>
        <Field label="淡出">
          <NumberInput value={a.fadeOut} min={0} max={10} step={0.1} unit="s" onChange={(v) => patch((x) => void (x.fadeOut = v), "au-fo")} />
        </Field>
      </Section>
    </div>
  );
}

function BookendInspector({ which }: { which: "intro" | "outro" }) {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const b = project.style.brand[which];
  const isIntro = which === "intro";
  return (
    <div>
      <Header title={isIntro ? "片头动画" : "片尾动画"} subtitle={b.mode === "template" ? b.template : b.mode === "video" ? "自定义视频" : "无"} />
      <Section title="模式">
        <Segmented
          value={b.mode}
          onChange={(v) => update((d) => void (d.style.brand[which].mode = v))}
          options={[
            { id: "template", label: "模板" },
            { id: "video", label: "视频" },
            { id: "none", label: "无" },
          ]}
        />
      </Section>
      <Section title="内容">
        <Field label="时长">
          <NumberInput value={b.duration} min={1} max={20} step={0.1} unit="s" slider onChange={(v) => update((d) => void (d.style.brand[which].duration = v), { history: false, coalesce: "bk-dur" })} />
        </Field>
        {!isIntro && (
          <>
            <Field label="大标题" inline={false}>
              <TextInput value={project.style.brand.outro.title} onChange={(v) => update((d) => void (d.style.brand.outro.title = v), { coalesce: "out-title" })} />
            </Field>
            <Field label="副标题" inline={false}>
              <TextArea value={project.style.brand.outro.subtitle} onChange={(v) => update((d) => void (d.style.brand.outro.subtitle = v))} rows={2} />
            </Field>
          </>
        )}
      </Section>
      <div className="px-3 py-3 text-[11px] leading-relaxed text-fog">模板、Logo 与视频在「品牌」面板里设置。</div>
    </div>
  );
}

function TitleInspector() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const ts = project.style.title;
  return (
    <div>
      <Header title="主题大标题" subtitle={TITLE_TEMPLATES.find((t) => t.id === ts.template)?.label} />
      <Section title="内容">
        <Field label="主标题" inline={false}>
          <TextArea value={project.title.title} onChange={(v) => update((d) => void (d.title.title = v))} rows={2} />
        </Field>
        <Field label="副标题" inline={false}>
          <TextArea value={project.title.subtitle} onChange={(v) => update((d) => void (d.title.subtitle = v))} rows={2} />
        </Field>
      </Section>
      <Section title="模板">
        <div className="grid grid-cols-2 gap-1.5">
          {TITLE_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => update((d) => void (d.style.title.template = t.id))} className={clsx("rounded border px-2 py-1 text-[11.5px]", ts.template === t.id ? "border-safelight bg-safelight/10" : "border-line hover:border-ink-5")}>
              {t.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="外观">
        <Field label="背景">
          <Segmented
            value={ts.background}
            onChange={(v) => update((d) => void (d.style.title.background = v))}
            options={[
              { id: "blur-first", label: "首图虚化" },
              { id: "solid", label: "纯色" },
              { id: "gradient", label: "渐变" },
            ]}
          />
        </Field>
        <Field label="时长">
          <NumberInput value={ts.duration} min={1} max={10} step={0.1} unit="s" slider onChange={(v) => update((d) => void (d.style.title.duration = v), { history: false, coalesce: "t-dur" })} />
        </Field>
        <Field label="标题字号">
          <NumberInput value={ts.titleSize} min={40} max={240} step={1} slider onChange={(v) => update((d) => void (d.style.title.titleSize = v), { history: false, coalesce: "t-size" })} />
        </Field>
        <Field label="副标题字号">
          <NumberInput value={ts.subtitleSize} min={16} max={100} step={1} slider onChange={(v) => update((d) => void (d.style.title.subtitleSize = v), { history: false, coalesce: "t-ssize" })} />
        </Field>
      </Section>
    </div>
  );
}

function LogoInspector() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const L = project.style.brand.logo;
  return (
    <div>
      <Header title="Logo 角标" subtitle="仅在正片显示" />
      <Section title="位置与大小">
        <Field label="宽度">
          <NumberInput value={L.size} min={40} max={600} step={1} slider onChange={(v) => update((d) => void (d.style.brand.logo.size = v), { history: false, coalesce: "l-size" })} />
        </Field>
        <Field label="左边距">
          <NumberInput value={L.marginX} min={0} max={DESIGN_W} step={1} slider onChange={(v) => update((d) => void (d.style.brand.logo.marginX = v), { history: false, coalesce: "l-mx" })} />
        </Field>
        <Field label="上边距">
          <NumberInput value={L.marginY} min={0} max={DESIGN_H} step={1} slider onChange={(v) => update((d) => void (d.style.brand.logo.marginY = v), { history: false, coalesce: "l-my" })} />
        </Field>
        <Field label="不透明度">
          <NumberInput value={L.opacity} min={0.2} max={1} step={0.05} digits={2} slider onChange={(v) => update((d) => void (d.style.brand.logo.opacity = v), { history: false, coalesce: "l-op" })} />
        </Field>
        <Toggle checked={L.shadow} onChange={(v) => update((d) => void (d.style.brand.logo.shadow = v))} label="投影（在浅色画面上更清晰）" />
      </Section>
      <div className="px-3 py-3 text-[11px] leading-relaxed text-fog">Logo 图片在「品牌」面板上传。也可以在画面上直接拖动。</div>
    </div>
  );
}

function CaptionInspector({ groupId }: { groupId: string }) {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const group = project.groups.find((g) => g.id === groupId);
  const cs = project.style.caption;
  return (
    <div>
      <Header title="分组小标题" subtitle={group?.name} />
      <Section title="内容">
        <Field label="文字" inline={false}>
          <TextInput value={group?.name ?? ""} onChange={(v) => update((d) => updateGroup(d, groupId, (g) => void (g.name = v)), { coalesce: "cap-name" })} />
        </Field>
        <Field label="位置 X">
          <NumberInput value={(group?.captionPos ?? cs.pos).x} min={0} max={DESIGN_W} step={1} slider onChange={(v) => update((d) => updateGroup(d, groupId, (g) => void (g.captionPos = { x: v, y: (g.captionPos ?? d.style.caption.pos).y })), { history: false, coalesce: "cap-x" })} />
        </Field>
        <Field label="位置 Y">
          <NumberInput value={(group?.captionPos ?? cs.pos).y} min={0} max={DESIGN_H} step={1} slider onChange={(v) => update((d) => updateGroup(d, groupId, (g) => void (g.captionPos = { x: (g.captionPos ?? d.style.caption.pos).x, y: v })), { history: false, coalesce: "cap-y" })} />
        </Field>
      </Section>
      <Section title="样式">
        <TextStyleEditor
          style={cs.style}
          anim={cs.anim}
          previewText={group?.name ?? ""}
          onChange={(p, c) => update((d) => Object.assign(d.style.caption.style, p), { coalesce: c })}
          onAnimChange={(p) => update((d) => Object.assign(d.style.caption.anim, p))}
        />
      </Section>
    </div>
  );
}

function SubtitleStyleInspector({ track }: { track: "top" | "bottom" }) {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const s = track === "top" ? project.style.subtitleTop : project.style.subtitleBottom;
  const sample = project.subtitles[track][0]?.text ?? "字幕预览 Subtitle";
  return (
    <div>
      <Header title={track === "top" ? "顶部字幕样式" : "底部字幕样式"} subtitle={`${project.subtitles[track].length} 条`} />
      <Section title="轨道">
        <Toggle checked={s.enabled} onChange={(v) => update((d) => void ((track === "top" ? d.style.subtitleTop : d.style.subtitleBottom).enabled = v))} label="显示这条字幕轨" />
        <Field label="垂直位置">
          <NumberInput value={s.y} min={20} max={DESIGN_H - 20} step={1} slider onChange={(v) => update((d) => void ((track === "top" ? d.style.subtitleTop : d.style.subtitleBottom).y = v), { history: false, coalesce: "sub-y" })} />
        </Field>
        <Field label="最大宽度">
          <NumberInput value={s.maxWidth} min={400} max={DESIGN_W} step={10} slider onChange={(v) => update((d) => void ((track === "top" ? d.style.subtitleTop : d.style.subtitleBottom).maxWidth = v), { history: false, coalesce: "sub-w" })} />
        </Field>
      </Section>
      <Section title="样式">
        <TextStyleEditor
          style={s.style}
          previewText={sample}
          onChange={(p, c) => update((d) => Object.assign((track === "top" ? d.style.subtitleTop : d.style.subtitleBottom).style, p), { coalesce: c })}
        />
      </Section>
    </div>
  );
}

export function NewGroupHint() {
  const [name, setName] = useState("");
  return (
    <div className="flex gap-1 p-2">
      <TextInput value={name} onChange={setName} placeholder="新分组名" />
      <Button
        size="sm"
        onClick={() => {
          useEditor.getState().update((d) => {
            const g = createGroup(name || `${d.groups.length + 1}月`, d.groups.length);
            d.groups.push(g);
          });
          setName("");
        }}
      >
        添加
      </Button>
    </div>
  );
}

