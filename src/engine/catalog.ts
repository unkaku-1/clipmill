import type {
  IntroTemplate,
  MotionType,
  OutroTemplate,
  RandomPool,
  TextAnim,
  TextPreset,
  TitleTemplate,
  TransitionType,
} from "@/types/project";

export interface CatalogItem<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

export const TRANSITIONS: (CatalogItem<TransitionType> & { pool: "soft" | "dynamic" | "none" })[] = [
  { id: "cut", label: "硬切", pool: "none", hint: "无过渡，直接切换" },
  { id: "fade", label: "交叉淡化", pool: "soft" },
  { id: "fade-black", label: "黑场过渡", pool: "soft" },
  { id: "fade-white", label: "白闪", pool: "soft" },
  { id: "zoom-in", label: "推近", pool: "soft" },
  { id: "zoom-out", label: "拉远", pool: "soft" },
  { id: "slide-left", label: "左滑入", pool: "dynamic" },
  { id: "slide-right", label: "右滑入", pool: "dynamic" },
  { id: "slide-up", label: "上滑入", pool: "dynamic" },
  { id: "slide-down", label: "下滑入", pool: "dynamic" },
  { id: "push-left", label: "左推", pool: "dynamic" },
  { id: "push-right", label: "右推", pool: "dynamic" },
  { id: "wipe-left", label: "左擦除", pool: "dynamic" },
  { id: "wipe-right", label: "右擦除", pool: "dynamic" },
  { id: "wipe-down", label: "下擦除", pool: "dynamic" },
  { id: "diagonal", label: "斜角擦除", pool: "dynamic" },
  { id: "iris", label: "圆形光圈", pool: "dynamic" },
  { id: "blinds", label: "百叶窗", pool: "dynamic" },
  { id: "split", label: "中间开门", pool: "dynamic" },
  { id: "rotate", label: "旋转缩放", pool: "dynamic" },
  { id: "pixelate", label: "像素化", pool: "dynamic" },
];

export const TRANSITION_LABEL = Object.fromEntries(TRANSITIONS.map((t) => [t.id, t.label])) as Record<
  TransitionType,
  string
>;

export const RANDOM_POOLS: CatalogItem<RandomPool>[] = [
  { id: "soft", label: "柔和", hint: "淡化、黑场、推拉，适合温情回顾" },
  { id: "dynamic", label: "动感", hint: "滑入、擦除、光圈、百叶窗，节奏更快" },
  { id: "all", label: "全部", hint: "所有过渡随机混搭" },
];

export function transitionPool(pool: RandomPool): TransitionType[] {
  return TRANSITIONS.filter((t) => t.pool !== "none" && (pool === "all" || t.pool === pool)).map((t) => t.id);
}

export const MOTIONS: CatalogItem<MotionType>[] = [
  { id: "auto", label: "自动（轮换）" },
  { id: "none", label: "静止" },
  { id: "zoom-in", label: "缓慢推近" },
  { id: "zoom-out", label: "缓慢拉远" },
  { id: "pan-left", label: "向左平移" },
  { id: "pan-right", label: "向右平移" },
  { id: "pan-up", label: "向上平移" },
  { id: "pan-down", label: "向下平移" },
];

export const CONCRETE_MOTIONS: MotionType[] = ["zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"];

export const TEXT_PRESETS: CatalogItem<TextPreset>[] = [
  { id: "bar", label: "竖线强调" },
  { id: "tag", label: "色块标签" },
  { id: "pill", label: "胶囊" },
  { id: "underline", label: "下划线" },
  { id: "glass", label: "毛玻璃" },
  { id: "outline", label: "描边" },
  { id: "shadow", label: "投影" },
  { id: "neon", label: "霓虹" },
  { id: "boxed", label: "线框" },
  { id: "gradient", label: "渐变字" },
  { id: "plain", label: "纯文字" },
];

export const TEXT_ANIMS: CatalogItem<TextAnim>[] = [
  { id: "none", label: "无" },
  { id: "fade", label: "淡入淡出" },
  { id: "rise", label: "上浮" },
  { id: "slide-left", label: "从左滑入" },
  { id: "slide-right", label: "从右滑入" },
  { id: "pop", label: "弹出" },
  { id: "wipe", label: "擦除显现" },
  { id: "typewriter", label: "打字机" },
  { id: "bounce", label: "逐字弹跳" },
  { id: "spread", label: "字距展开" },
];

export const INTRO_TEMPLATES: CatalogItem<IntroTemplate>[] = [
  { id: "logo-burst", label: "光环绽放", hint: "同心光环扩散，Logo 弹出" },
  { id: "film-leader", label: "胶片倒数", hint: "经典 3-2-1 胶片倒计时" },
  { id: "stripes", label: "斜条扫入", hint: "品牌色斜条扫过屏幕" },
  { id: "line-draw", label: "极简线条", hint: "一条线划过，品牌名显现" },
  { id: "particles", label: "光粒汇聚", hint: "粒子汇聚成环，Logo 点亮" },
];

export const OUTRO_TEMPLATES: CatalogItem<OutroTemplate>[] = [
  { id: "thanks", label: "感谢观看", hint: "居中致谢，渐隐黑场" },
  { id: "follow", label: "关注我们", hint: "品牌色面板滑入" },
  { id: "iris-close", label: "光圈收束", hint: "圆形光圈收拢到 Logo" },
  { id: "credits", label: "片尾滚动", hint: "字幕向上滚动" },
];

export const TITLE_TEMPLATES: CatalogItem<TitleTemplate>[] = [
  { id: "center", label: "居中淡入" },
  { id: "split-line", label: "双线展开" },
  { id: "stack-left", label: "左侧堆叠" },
  { id: "cinema", label: "电影宽银幕" },
  { id: "typewriter", label: "打字机" },
  { id: "mask", label: "色块揭示" },
];

export const GROUP_COLORS = ["#E8B44C", "#6FA287", "#5B8DB8", "#C7746B", "#9B83C2", "#C9A27E", "#5FA8A6", "#B88A5B"];
