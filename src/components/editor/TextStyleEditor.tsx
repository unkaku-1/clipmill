import type { TextAlign, TextAnimSpec, TextStyle } from "@/types/project";
import { FONTS } from "@/lib/fonts";
import { TEXT_ANIMS, TEXT_PRESETS } from "@/engine/catalog";
import { ColorInput, Field, NumberInput, Select, Segmented } from "@/components/ui/controls";
import { TextPreview } from "@/components/editor/TextPreview";

/** Shared editor for every text style in the project. */
export function TextStyleEditor({
  style,
  anim,
  onChange,
  onAnimChange,
  previewText,
  sizeLabel = "字号",
}: {
  style: TextStyle;
  anim?: TextAnimSpec;
  onChange: (patch: Partial<TextStyle>, coalesce?: string) => void;
  onAnimChange?: (patch: Partial<TextAnimSpec>) => void;
  previewText: string;
  sizeLabel?: string;
}) {
  const font = FONTS.find((f) => f.id === style.fontId);
  return (
    <div className="space-y-2.5">
      <div className="rounded-md border border-line bg-ink-1 py-2">
        <TextPreview text={previewText || "预览文字"} style={style} anim={anim} height={72} width={276} />
      </div>
      <Field label="样式">
        <Select value={style.preset} onChange={(v) => onChange({ preset: v }, "ts-preset")} options={TEXT_PRESETS.map((p) => ({ id: p.id, label: p.label }))} />
      </Field>
      <Field label="字体">
        <Select
          value={style.fontId}
          onChange={(v) => {
            const f = FONTS.find((x) => x.id === v)!;
            onChange({ fontId: v, fontWeight: f.weights.includes(style.fontWeight) ? style.fontWeight : f.weights[f.weights.length - 1] }, "ts-font");
          }}
          options={FONTS.map((f) => ({ id: f.id, label: f.label }))}
        />
      </Field>
      <Field label="字重">
        <Segmented
          value={String(style.fontWeight)}
          onChange={(v) => onChange({ fontWeight: Number(v) }, "ts-weight")}
          options={(font?.weights ?? [400, 700]).map((w) => ({ id: String(w), label: w >= 900 ? "特粗" : w >= 700 ? "粗" : "常规" }))}
        />
      </Field>
      <Field label={sizeLabel}>
        <NumberInput value={style.fontSize} min={16} max={260} step={1} slider onChange={(v) => onChange({ fontSize: v }, "ts-size")} />
      </Field>
      <Field label="对齐">
        <Segmented<TextAlign>
          value={style.align}
          onChange={(v) => onChange({ align: v }, "ts-align")}
          options={[
            { id: "left", label: "左" },
            { id: "center", label: "中" },
            { id: "right", label: "右" },
          ]}
        />
      </Field>
      <Field label="字距">
        <NumberInput value={style.letterSpacing} min={-10} max={40} step={0.5} slider onChange={(v) => onChange({ letterSpacing: v }, "ts-ls")} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="文字色" inline={false}>
          <ColorInput value={style.color} onChange={(v) => onChange({ color: v }, "ts-color")} />
        </Field>
        <Field label="强调色" inline={false}>
          <ColorInput value={style.accent} onChange={(v) => onChange({ accent: v }, "ts-accent")} />
        </Field>
      </div>
      {anim && onAnimChange && (
        <>
          <div className="pt-1 text-[11px] font-semibold tracking-wider text-fog uppercase">动画</div>
          <Field label="入场">
            <Select value={anim.in} onChange={(v) => onAnimChange({ in: v })} options={TEXT_ANIMS.map((a) => ({ id: a.id, label: a.label }))} />
          </Field>
          <Field label="入场时长">
            <NumberInput value={anim.inDur} min={0.1} max={3} step={0.05} unit="s" slider onChange={(v) => onAnimChange({ inDur: v })} />
          </Field>
          <Field label="退场">
            <Select value={anim.out} onChange={(v) => onAnimChange({ out: v })} options={TEXT_ANIMS.map((a) => ({ id: a.id, label: a.label }))} />
          </Field>
          <Field label="退场时长">
            <NumberInput value={anim.outDur} min={0.1} max={3} step={0.05} unit="s" slider onChange={(v) => onAnimChange({ outDur: v })} />
          </Field>
        </>
      )}
    </div>
  );
}
