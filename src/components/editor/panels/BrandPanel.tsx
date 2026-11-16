import { useRef, useState } from "react";
import clsx from "clsx";
import { ImagePlus, Save, Sparkles, Star, Trash2 } from "lucide-react";
import type { IntroTemplate, OutroTemplate } from "@/types/project";
import { useEditor } from "@/store/editor";
import { importFile } from "@/engine/importer";
import { INTRO_TEMPLATES, OUTRO_TEMPLATES } from "@/engine/catalog";
import { listPresets } from "@/db";
import { saveStyleAsPreset } from "@/lib/projects";
import { useThumb } from "@/engine/blobs";
import { Button, ColorInput, Field, NumberInput, Section, Segmented, TextArea, TextInput } from "@/components/ui/controls";
import { Modal, toast } from "@/components/ui/feedback";

export function BrandPanel() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const addAssets = useEditor((s) => s.addAssets);
  const brand = project.style.brand;
  const logoInput = useRef<HTMLInputElement>(null);
  const introInput = useRef<HTMLInputElement>(null);
  const outroInput = useRef<HTMLInputElement>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDefault, setPresetDefault] = useState(true);
  const logoUrl = useThumb(brand.logoAssetId);

  const upload = async (file: File, kind: "logo" | "intro" | "outro") => {
    try {
      const a = await importFile(file, kind === "logo" ? "image" : "video");
      addAssets([a]);
      update((d) => {
        d.library.push(a.id);
        if (kind === "logo") d.style.brand.logoAssetId = a.id;
        if (kind === "intro") {
          d.style.brand.intro.videoAssetId = a.id;
          d.style.brand.intro.mode = "video";
          if (a.duration) d.style.brand.intro.duration = a.duration;
        }
        if (kind === "outro") {
          d.style.brand.outro.videoAssetId = a.id;
          d.style.brand.outro.mode = "video";
          if (a.duration) d.style.brand.outro.duration = a.duration;
        }
      });
      toast(kind === "logo" ? "Logo 已更新" : "视频已导入", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error", 5000);
    }
  };

  return (
    <div className="pb-6">
      <Section title="品牌">
        <Field label="品牌名">
          <TextInput value={brand.name} onChange={(v) => update((d) => void (d.style.brand.name = v), { coalesce: "brand-name" })} />
        </Field>
        <Field label="标语">
          <TextInput value={brand.slogan} onChange={(v) => update((d) => void (d.style.brand.slogan = v), { coalesce: "brand-slogan" })} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="主色" inline={false}>
            <ColorInput value={brand.primary} onChange={(v) => update((d) => void (d.style.brand.primary = v), { coalesce: "brand-primary" })} />
          </Field>
          <Field label="辅色" inline={false}>
            <ColorInput value={brand.secondary} onChange={(v) => update((d) => void (d.style.brand.secondary = v), { coalesce: "brand-secondary" })} />
          </Field>
          <Field label="底色" inline={false}>
            <ColorInput value={brand.background} onChange={(v) => update((d) => void (d.style.brand.background = v), { coalesce: "brand-bg" })} />
          </Field>
        </div>
      </Section>

      <Section title="Logo（左上角）">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-md border border-line bg-ink-1">
            {logoUrl ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlus size={18} className="text-fog" />}
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Button size="sm" onClick={() => logoInput.current?.click()}>
              上传 Logo
            </Button>
            {brand.logoAssetId && (
              <Button size="sm" variant="ghost" onClick={() => update((d) => void (d.style.brand.logoAssetId = null))}>
                <Trash2 size={12} /> 移除
              </Button>
            )}
          </div>
          <input ref={logoInput} type="file" accept="image/*,.svg" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f, "logo");
            e.target.value = "";
          }} />
        </div>
        <Field label="宽度">
          <NumberInput value={brand.logo.size} min={40} max={600} step={2} slider unit="px" onChange={(v) => update((d) => void (d.style.brand.logo.size = v), { history: false, coalesce: "logo-size" })} />
        </Field>
        <Field label="边距">
          <div className="flex gap-2">
            <NumberInput value={brand.logo.marginX} min={0} max={800} step={2} onChange={(v) => update((d) => void (d.style.brand.logo.marginX = v), { history: false, coalesce: "logo-mx" })} />
            <NumberInput value={brand.logo.marginY} min={0} max={800} step={2} onChange={(v) => update((d) => void (d.style.brand.logo.marginY = v), { history: false, coalesce: "logo-my" })} />
          </div>
        </Field>
        <Field label="不透明度">
          <NumberInput value={brand.logo.opacity} min={0.2} max={1} step={0.05} slider digits={2} onChange={(v) => update((d) => void (d.style.brand.logo.opacity = v), { history: false, coalesce: "logo-op" })} />
        </Field>
        <div className="text-[11px] leading-relaxed text-fog">Logo 只在片头结束到片尾开始之间显示，片头片尾动画里会自动出现。</div>
      </Section>

      <Section title="片头动画">
        <Segmented
          value={brand.intro.mode}
          onChange={(v) => update((d) => void (d.style.brand.intro.mode = v))}
          options={[
            { id: "template", label: "模板" },
            { id: "video", label: "视频" },
            { id: "none", label: "无" },
          ]}
        />
        {brand.intro.mode === "template" && (
          <>
            <div className="grid grid-cols-1 gap-1.5">
              {INTRO_TEMPLATES.map((t) => (
                <TemplateRow
                  key={t.id}
                  active={brand.intro.template === t.id}
                  label={t.label}
                  hint={t.hint}
                  onClick={() => update((d) => void (d.style.brand.intro.template = t.id as IntroTemplate))}
                />
              ))}
            </div>
            <Field label="时长">
              <NumberInput value={brand.intro.duration} min={1.5} max={10} step={0.1} unit="s" slider onChange={(v) => update((d) => void (d.style.brand.intro.duration = v), { history: false, coalesce: "intro-dur" })} />
            </Field>
          </>
        )}
        {brand.intro.mode === "video" && (
          <div className="space-y-2">
            <Button className="w-full" onClick={() => introInput.current?.click()}>
              上传片头视频
            </Button>
            <input ref={introInput} type="file" accept="video/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f, "intro");
              e.target.value = "";
            }} />
            <div className="text-[11px] text-fog">自定义片头会替换模板动画，Logo 角标从片头结束后出现。</div>
          </div>
        )}
      </Section>

      <Section title="片尾动画">
        <Segmented
          value={brand.outro.mode}
          onChange={(v) => update((d) => void (d.style.brand.outro.mode = v))}
          options={[
            { id: "template", label: "模板" },
            { id: "video", label: "视频" },
            { id: "none", label: "无" },
          ]}
        />
        {brand.outro.mode === "template" && (
          <div className="grid grid-cols-1 gap-1.5">
            {OUTRO_TEMPLATES.map((t) => (
              <TemplateRow key={t.id} active={brand.outro.template === t.id} label={t.label} hint={t.hint} onClick={() => update((d) => void (d.style.brand.outro.template = t.id as OutroTemplate))} />
            ))}
          </div>
        )}
        {brand.outro.mode !== "none" && (
          <>
            <Field label="大标题">
              <TextInput value={brand.outro.title} onChange={(v) => update((d) => void (d.style.brand.outro.title = v), { coalesce: "outro-title" })} />
            </Field>
            <Field label="副标题">
              <TextArea value={brand.outro.subtitle} onChange={(v) => update((d) => void (d.style.brand.outro.subtitle = v))} rows={2} />
            </Field>
            <Field label="时长">
              <NumberInput value={brand.outro.duration} min={2} max={20} step={0.1} unit="s" slider onChange={(v) => update((d) => void (d.style.brand.outro.duration = v), { history: false, coalesce: "outro-dur" })} />
            </Field>
          </>
        )}
        {brand.outro.mode === "video" && (
          <>
            <Button className="w-full" onClick={() => outroInput.current?.click()}>
              上传片尾视频
            </Button>
            <input ref={outroInput} type="file" accept="video/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f, "outro");
              e.target.value = "";
            }} />
          </>
        )}
      </Section>

      <Section title="固定模式">
        <Button className="w-full" onClick={() => {
          setPresetName(`${brand.name} · 模式`);
          setPresetOpen(true);
        }}>
          <Save size={13} /> 保存为模式（预设）
        </Button>
        <div className="text-[11px] leading-relaxed text-fog">模式会保存 Logo、片头片尾、配色、字幕与小标题样式，新建工程时可一键套用。</div>
        <PresetPicker />
      </Section>

      <Modal
        open={presetOpen}
        onClose={() => setPresetOpen(false)}
        title="保存为模式"
        width={420}
        footer={
          <Button
            variant="primary"
            onClick={async () => {
              const name = presetName.trim();
              if (!name) return;
              const p = useEditor.getState().project;
              if (!p) return;
              await saveStyleAsPreset(name, p.style, presetDefault);
              setPresetOpen(false);
              toast(`已保存模式「${name}」`, "success");
            }}
          >
            保存
          </Button>
        }
      >
        <div className="space-y-3 p-4">
          <Field label="名称" inline={false}>
            <TextInput value={presetName} onChange={setPresetName} />
          </Field>
          <label className="flex items-center gap-2 text-xs text-mist">
            <input type="checkbox" checked={presetDefault} onChange={(e) => setPresetDefault(e.target.checked)} />
            设为默认模式（新建工程自动套用）
          </label>
        </div>
      </Modal>
    </div>
  );
}

function TemplateRow({ active, label, hint, onClick }: { active: boolean; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors", active ? "border-safelight/70 bg-safelight/10" : "border-line hover:border-ink-5 hover:bg-ink-3")}
    >
      <span className={clsx("h-2 w-2 rounded-full", active ? "bg-safelight" : "bg-ink-5")} />
      <span className="min-w-0">
        <span className="block text-[12.5px] text-paper">{label}</span>
        {hint && <span className="block truncate text-[10.5px] text-fog">{hint}</span>}
      </span>
    </button>
  );
}

function PresetPicker() {
  const [presets, setPresets] = useState<Awaited<ReturnType<typeof listPresets>>>([]);
  const [open, setOpen] = useState(false);
  const apply = async (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    useEditor.getState().update((d) => {
      d.style = structuredClone(p.style);
    });
    toast(`已套用模式「${p.name}」`, "success");
  };
  return (
    <div className="space-y-1.5">
      <Button variant="ghost" size="sm" className="w-full" onClick={async () => {
        setPresets(await listPresets());
        setOpen(!open);
      }}>
        <Sparkles size={12} /> {open ? "收起模式列表" : "套用已保存的模式"}
      </Button>
      {open &&
        (presets.length === 0 ? (
          <div className="text-[11px] text-fog">还没有保存过模式</div>
        ) : (
          presets.map((m) => (
            <button key={m.id} onClick={() => apply(m.id)} className="flex w-full items-center gap-2 rounded border border-line px-2 py-1 text-left text-xs hover:border-safelight/60">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m.style.brand.primary }} />
              <span className="flex-1 truncate">{m.name}</span>
              {m.isDefault && <Star size={11} className="fill-safelight text-safelight" />}
            </button>
          ))
        ))}
    </div>
  );
}
