import type {
  AssetMeta,
  Clip,
  Group,
  Project,
  ProjectStyle,
  TextItem,
  TextStyle,
} from "@/types/project";
import { GROUP_COLORS } from "@/engine/catalog";
import { uid } from "@/lib/util";

export const BRAND_ORANGE = "#FF5A36";

export function defaultTextStyle(partial: Partial<TextStyle> = {}): TextStyle {
  return {
    preset: "shadow",
    fontId: "noto-sans",
    fontSize: 64,
    fontWeight: 700,
    color: "#FFFFFF",
    accent: BRAND_ORANGE,
    letterSpacing: 0,
    align: "center",
    ...partial,
  };
}

export function createDefaultStyle(): ProjectStyle {
  return {
    brand: {
      name: "ClipMill",
      slogan: "每一期，都准时出片",
      logoAssetId: null,
      logo: { size: 150, marginX: 56, marginY: 44, opacity: 0.92, shadow: true },
      primary: BRAND_ORANGE,
      secondary: "#E8B44C",
      background: "#14110F",
      intro: { mode: "template", template: "logo-burst", videoAssetId: null, duration: 3.5 },
      outro: {
        mode: "template",
        template: "thanks",
        videoAssetId: null,
        duration: 4,
        title: "感谢观看",
        subtitle: "我们下期再见",
      },
    },
    title: {
      enabled: true,
      template: "center",
      duration: 3.2,
      background: "blur-first",
      bgColor: "#1C1815",
      fontId: "noto-sans",
      color: "#FFFFFF",
      accent: BRAND_ORANGE,
      titleSize: 128,
      subtitleSize: 46,
    },
    caption: {
      enabled: true,
      style: defaultTextStyle({ preset: "bar", fontSize: 52, align: "left" }),
      anim: { in: "slide-left", out: "fade", inDur: 0.5, outDur: 0.35 },
      pos: { x: 96, y: 960 },
    },
    subtitleTop: {
      enabled: true,
      style: defaultTextStyle({ preset: "outline", fontSize: 44, fontWeight: 700, accent: "#000000", color: "#FFE9A8" }),
      y: 92,
      maxWidth: 1560,
    },
    subtitleBottom: {
      enabled: true,
      style: defaultTextStyle({ preset: "outline", fontSize: 54, fontWeight: 700, accent: "#000000" }),
      y: 1000,
      maxWidth: 1560,
    },
    sequence: {
      imageDuration: 3,
      transition: { type: "fade", duration: 0.6 },
      motion: "auto",
      motionStrength: 0.6,
      fit: "cover",
      randomPool: "soft",
      titleTransition: { type: "fade-white", duration: 0.6 },
      outroTransition: { type: "fade-black", duration: 0.8 },
    },
    textDefaults: {
      style: defaultTextStyle({ preset: "tag", fontSize: 58, align: "left" }),
      anim: { in: "pop", out: "fade", inDur: 0.45, outDur: 0.3 },
    },
  };
}

export function createGroup(name: string, index: number): Group {
  return {
    id: uid("g"),
    name,
    color: GROUP_COLORS[index % GROUP_COLORS.length],
    showCaption: true,
    captionPos: null,
    clips: [],
  };
}

export function createClip(asset: AssetMeta, style: ProjectStyle): Clip {
  const seq = style.sequence;
  const isVideo = asset.kind === "video";
  return {
    id: uid("c"),
    assetId: asset.id,
    duration: isVideo ? Math.max(0.5, Math.min(asset.duration, 60)) : seq.imageDuration,
    trimIn: 0,
    transition: { ...seq.transition },
    motion: isVideo ? "none" : seq.motion,
    fit: seq.fit,
    volume: 1,
    muted: false,
  };
}

export function createTextItem(start: number, style: ProjectStyle, text = "11月"): TextItem {
  return {
    id: uid("t"),
    text,
    start,
    duration: 3,
    pos: { x: 1824, y: 120 },
    style: { ...style.textDefaults.style, align: "right" },
    anim: { ...style.textDefaults.anim },
  };
}

export function createProject(name: string, style?: ProjectStyle): Project {
  const now = Date.now();
  const s = style ? structuredClone(style) : createDefaultStyle();
  return {
    id: uid("p"),
    version: 1,
    name,
    createdAt: now,
    updatedAt: now,
    library: [],
    style: s,
    title: { title: "本期主题", subtitle: "在这里写副标题" },
    groups: [createGroup("第一组", 0)],
    texts: [],
    subtitles: { top: [], bottom: [] },
    audio: [],
  };
}
