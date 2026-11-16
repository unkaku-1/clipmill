import { useMemo, useState } from "react";
import clsx from "clsx";
import { Dices, LayoutTemplate, Shuffle, Sparkles } from "lucide-react";
import type { TitleTemplate, TransitionType } from "@/types/project";
import { useEditor } from "@/store/editor";
import { RANDOM_POOLS, TEXT_ANIMS, TITLE_TEMPLATES, TRANSITIONS, transitionPool } from "@/engine/catalog";
import { applyTransitionToAll, randomizeMotions, randomizeTransitions } from "@/engine/automation";
import { Button, Field, NumberInput, Section, Segmented, Select, Toggle } from "@/components/ui/controls";
import { toast } from "@/components/ui/feedback";
import { FONTS } from "@/lib/fonts";

export function TemplatesPanel() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const assets = useEditor((s) => s.assets);
  const seq = project.style.sequence;
  const [onlySelected, setOnlySelected] = useState(false);
  const selection = useEditor((s) => s.selection);

  const selectedIds = useMemo(() => {
    if (!onlySelected || selection?.kind !== "clip") return undefined;
    return new Set([selection.id]);
  }, [onlySelected, selection]);

  const imageCount = project.groups.flatMap((g) => g.clips).filter((c) => assets[c.assetId]?.kind === "image").length;

  return (
    <div className="pb-6">
      <Section title="过渡效果">
        <div className="rounded-lg border border-safelight/30 bg-safelight/5 p-2.5">
          <div className="mb-2 text-[11px] leading-relaxed text-mist">一键给素材随机分配过渡动画，同一组里不会连续出现两次相同效果。</div>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {RANDOM_POOLS.map((p) => (
              <button
                key={p.id}
                title={p.hint}
                onClick={() => update((d) => void (d.style.sequence.randomPool = p.id))}
                className={clsx("rounded-md border py-1 text-[11px]", seq.randomPool === p.id ? "border-safelight bg-safelight/15 text-paper" : "border-line text-fog hover:text-mist")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="mb-2 flex items-center gap-1.5 text-[11px] text-fog">
            <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
            只作用于选中的素材
          </label>
          <div className="flex gap-1.5">
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={() => {
                update((d) => randomizeTransitions(d, d.style.sequence.randomPool, selectedIds));
                toast("已随机过渡", "success");
              }}
            >
              <Shuffle size={13} /> 随机过渡
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                update((d) => randomizeMotions(d, assets, selectedIds));
                toast("已随机运镜", "success");
              }}
            >
              <Dices size={13} /> 随机运镜
            </Button>
          </div>
        </div>
        <Field label="过渡时长">
          <NumberInput value={seq.transition.duration} min={0.1} max={1.5} step={0.05} unit="s" slider onChange={(v) => update((d) => {
            d.style.sequence.transition.duration = v;
            for (const g of d.groups) for (const c of g.clips) c.transition.duration = v;
          }, { history: false, coalesce: "trans-dur" })} />
        </Field>
        <Field label="全部设为">
          <Select
            value={seq.transition.type}
            onChange={(v) => update((d) => {
              applyTransitionToAll(d, v as TransitionType, d.style.sequence.transition.duration);
              d.style.sequence.transition.type = v as TransitionType;
            })}
            options={TRANSITIONS.map((t) => ({ id: t.id, label: t.label }))}
          />
        </Field>
        <Field label="默认运镜">
          <Select
            value={seq.motion}
            onChange={(v) => update((d) => {
              d.style.sequence.motion = v as typeof seq.motion;
              for (const g of d.groups) for (const c of g.clips) if (assets[c.assetId]?.kind === "image") c.motion = v as typeof seq.motion;
            })}
            options={[
              { id: "auto", label: "自动（每张不同）" },
              { id: "none", label: "静止" },
              { id: "zoom-in", label: "缓慢推近" },
              { id: "zoom-out", label: "缓慢拉远" },
              { id: "pan-left", label: "向左平移" },
              { id: "pan-right", label: "向右平移" },
              { id: "pan-up", label: "向上平移" },
              { id: "pan-down", label: "向下平移" },
            ]}
          />
        </Field>
        <Field label="运镜幅度">
          <NumberInput value={seq.motionStrength} min={0} max={1} step={0.05} slider digits={2} onChange={(v) => update((d) => void (d.style.sequence.motionStrength = v), { history: false, coalesce: "motion-str" })} />
        </Field>
        <Field label="图片时长">
          <NumberInput value={seq.imageDuration} min={0.5} max={20} step={0.1} unit="s" slider onChange={(v) => update((d) => {
            d.style.sequence.imageDuration = v;
            for (const g of d.groups) for (const c of g.clips) if (assets[c.assetId]?.kind === "image") c.duration = v;
          }, { history: false, coalesce: "img-dur" })} />
        </Field>
        <div className="text-[11px] text-fog">共 {imageCount} 张图片</div>
      </Section>

      <Section title="主题大标题">
        <Toggle checked={project.style.title.enabled} onChange={(v) => update((d) => void (d.style.title.enabled = v))} label="显示主题标题" />
        <div className="grid grid-cols-2 gap-1.5">
          {TITLE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => update((d) => void (d.style.title.template = t.id as TitleTemplate))}
              className={clsx("rounded-md border px-2 py-1.5 text-left text-[12px]", project.style.title.template === t.id ? "border-safelight bg-safelight/10" : "border-line hover:border-ink-5")}
            >
              <LayoutTemplate size={13} className="mb-1 text-fog" />
              {t.label}
            </button>
          ))}
        </div>
        <Field label="背景">
          <Segmented
            value={project.style.title.background}
            onChange={(v) => update((d) => void (d.style.title.background = v))}
            options={[
              { id: "blur-first", label: "首图虚化" },
              { id: "solid", label: "纯色" },
              { id: "gradient", label: "渐变" },
            ]}
          />
        </Field>
        <Field label="时长">
          <NumberInput value={project.style.title.duration} min={1} max={10} step={0.1} unit="s" slider onChange={(v) => update((d) => void (d.style.title.duration = v), { history: false, coalesce: "title-dur" })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="标题字号">
            <NumberInput value={project.style.title.titleSize} min={40} max={240} step={2} slider onChange={(v) => update((d) => void (d.style.title.titleSize = v), { history: false, coalesce: "title-size" })} />
          </Field>
          <Field label="副标题字号">
            <NumberInput value={project.style.title.subtitleSize} min={16} max={96} step={1} slider onChange={(v) => update((d) => void (d.style.title.subtitleSize = v), { history: false, coalesce: "title-sub-size" })} />
          </Field>
        </div>
        <Field label="标题字体">
          <Select value={project.style.title.fontId} onChange={(v) => update((d) => void (d.style.title.fontId = v))} options={FONTS.map((f) => ({ id: f.id, label: f.label }))} />
        </Field>
      </Section>

      <Section title="分组小标题">
        <Toggle checked={project.style.caption.enabled} onChange={(v) => update((d) => void (d.style.caption.enabled = v))} label="显示分组小标题" />
        <div className="text-[11px] leading-relaxed text-fog">每个分组的主题名会自动显示在左下角（可拖动）。样式在右侧面板「分组小标题」里调整。</div>
      </Section>

      <Section title="文字动画预设">
        <div className="grid grid-cols-2 gap-1.5">
          {TEXT_ANIMS.map((a) => (
            <button
              key={a.id}
              onClick={() => update((d) => {
                d.style.caption.anim = { ...d.style.caption.anim, in: a.id };
                d.style.textDefaults.anim = { ...d.style.textDefaults.anim, in: a.id };
                for (const t of d.texts) t.anim.in = a.id;
              })}
              className={clsx("rounded-md border px-2 py-1 text-[12px]", project.style.caption.anim.in === a.id ? "border-safelight bg-safelight/10" : "border-line hover:border-ink-5")}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-fog">点击后应用到分组小标题和所有自定义文字。</div>
      </Section>

      <Section title="过渡效果库" defaultOpen={false}>
        <div className="flex flex-wrap gap-1">
          {TRANSITIONS.map((t) => (
            <span key={t.id} className={clsx("rounded border px-1.5 py-0.5 text-[11px]", transitionPool("all").includes(t.id) ? "border-line text-mist" : "border-line/60 text-fog")}>
              {t.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-fog">
          <Sparkles size={11} /> 共 {TRANSITIONS.length} 种，选中单个素材后可在右侧面板单独设置。
        </div>
      </Section>
    </div>
  );
}

