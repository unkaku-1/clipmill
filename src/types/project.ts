/**
 * ClipMill project data model.
 *
 * All positions and sizes are expressed in a fixed 1920x1080 "design space".
 * The renderer scales this space to the preview or export resolution, so a
 * project looks identical at 540p preview, 1080p export and 4K export.
 */

export type ID = string;

export interface Vec2 {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

export type AssetKind = "image" | "video" | "audio";

export interface AssetMeta {
  id: ID;
  kind: AssetKind;
  name: string;
  mime: string;
  size: number;
  /** Pixel size for images / videos, 0 for audio. */
  width: number;
  height: number;
  /** Seconds, 0 for still images. */
  duration: number;
  hasAudio: boolean;
  /** Waveform peaks (0..1) sampled at PEAKS_PER_SECOND, audio only. */
  peaks?: number[];
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export type TransitionType =
  | "cut"
  | "fade"
  | "fade-black"
  | "fade-white"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "push-left"
  | "push-right"
  | "wipe-left"
  | "wipe-right"
  | "wipe-down"
  | "diagonal"
  | "iris"
  | "zoom-in"
  | "zoom-out"
  | "blinds"
  | "split"
  | "rotate"
  | "pixelate";

export interface Transition {
  type: TransitionType;
  /** Seconds of overlap between the two shots. */
  duration: number;
}

export type MotionType =
  | "auto"
  | "none"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down";

export type FitMode = "cover" | "contain";

export type TextPreset =
  | "plain"
  | "shadow"
  | "outline"
  | "tag"
  | "pill"
  | "underline"
  | "bar"
  | "glass"
  | "neon"
  | "boxed"
  | "gradient";

export type TextAnim =
  | "none"
  | "fade"
  | "rise"
  | "slide-left"
  | "slide-right"
  | "pop"
  | "wipe"
  | "typewriter"
  | "bounce"
  | "spread";

export type TextAlign = "left" | "center" | "right";

export interface TextStyle {
  preset: TextPreset;
  fontId: string;
  /** Logical pixels in the 1920x1080 design space. */
  fontSize: number;
  fontWeight: number;
  color: string;
  /** Used by tag / pill / bar / underline / neon / outline / boxed / gradient. */
  accent: string;
  letterSpacing: number;
  align: TextAlign;
}

export interface TextAnimSpec {
  in: TextAnim;
  out: TextAnim;
  inDur: number;
  outDur: number;
}

export type IntroTemplate = "logo-burst" | "film-leader" | "stripes" | "line-draw" | "particles";
export type OutroTemplate = "thanks" | "follow" | "iris-close" | "credits";
export type TitleTemplate = "center" | "split-line" | "stack-left" | "cinema" | "typewriter" | "mask";
export type TitleBackground = "blur-first" | "solid" | "gradient";
export type RandomPool = "soft" | "dynamic" | "all";

/* ------------------------------------------------------------------ */
/* Style ("mode") - everything that stays fixed between episodes        */
/* ------------------------------------------------------------------ */

export interface BrandKit {
  name: string;
  slogan: string;
  logoAssetId: ID | null;
  logo: {
    /** Logical width of the logo. */
    size: number;
    marginX: number;
    marginY: number;
    opacity: number;
    shadow: boolean;
  };
  primary: string;
  secondary: string;
  background: string;
  intro: {
    mode: "template" | "video" | "none";
    template: IntroTemplate;
    videoAssetId: ID | null;
    duration: number;
  };
  outro: {
    mode: "template" | "video" | "none";
    template: OutroTemplate;
    videoAssetId: ID | null;
    duration: number;
    title: string;
    subtitle: string;
  };
}

export interface TitleStyle {
  enabled: boolean;
  template: TitleTemplate;
  duration: number;
  background: TitleBackground;
  bgColor: string;
  fontId: string;
  color: string;
  accent: string;
  titleSize: number;
  subtitleSize: number;
}

export interface CaptionStyle {
  enabled: boolean;
  style: TextStyle;
  anim: TextAnimSpec;
  /** Left / vertical-center anchor of the caption box. Default: bottom-left. */
  pos: Vec2;
}

export interface SubtitleTrackStyle {
  enabled: boolean;
  style: TextStyle;
  /** Vertical center of the subtitle block. */
  y: number;
  maxWidth: number;
}

export interface SequenceDefaults {
  imageDuration: number;
  transition: Transition;
  motion: MotionType;
  /** 0..1, how strong the Ken Burns movement is. */
  motionStrength: number;
  fit: FitMode;
  randomPool: RandomPool;
  /** Transition from the intro into the theme title. */
  titleTransition: Transition;
  /** Transition from the last shot into the outro. */
  outroTransition: Transition;
}

export interface ProjectStyle {
  brand: BrandKit;
  title: TitleStyle;
  caption: CaptionStyle;
  subtitleTop: SubtitleTrackStyle;
  subtitleBottom: SubtitleTrackStyle;
  sequence: SequenceDefaults;
  textDefaults: { style: TextStyle; anim: TextAnimSpec };
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

export interface Clip {
  id: ID;
  assetId: ID;
  /** Seconds on the timeline. */
  duration: number;
  /** Video only: source offset in seconds. */
  trimIn: number;
  /** Transition into this clip from the previous shot. */
  transition: Transition;
  motion: MotionType;
  fit: FitMode;
  volume: number;
  muted: boolean;
}

export interface Group {
  id: ID;
  name: string;
  color: string;
  showCaption: boolean;
  /** Per-group caption position, null means "use the global caption position". */
  captionPos: Vec2 | null;
  clips: Clip[];
}

export interface TextItem {
  id: ID;
  text: string;
  start: number;
  duration: number;
  pos: Vec2;
  style: TextStyle;
  anim: TextAnimSpec;
}

export interface Cue {
  id: ID;
  start: number;
  end: number;
  text: string;
}

export interface AudioClip {
  id: ID;
  assetId: ID;
  start: number;
  trimIn: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface Project {
  id: ID;
  version: 1;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** All assets imported into this project (media library). */
  library: ID[];
  style: ProjectStyle;
  title: { title: string; subtitle: string };
  groups: Group[];
  texts: TextItem[];
  subtitles: { top: Cue[]; bottom: Cue[] };
  audio: AudioClip[];
}

export interface StylePreset {
  id: ID;
  name: string;
  createdAt: number;
  isDefault: boolean;
  style: ProjectStyle;
}

export interface ProjectSummary {
  id: ID;
  name: string;
  updatedAt: number;
  duration: number;
  clipCount: number;
  coverAssetId: ID | null;
}
