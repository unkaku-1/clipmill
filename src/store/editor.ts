import { create } from "zustand";
import { produce, type Draft } from "immer";
import type { AssetMeta, ID, Project, ProjectSummary } from "@/types/project";
import { computeLayout, type Layout } from "@/engine/timeline";
import { saveProject } from "@/db";

export type SelKind =
  | "clip"
  | "group"
  | "text"
  | "cue-top"
  | "cue-bottom"
  | "audio"
  | "intro"
  | "outro"
  | "title"
  | "logo"
  | "caption"
  | "sub-top"
  | "sub-bottom";

export interface Selection {
  kind: SelKind;
  id: string;
}

export type PanelId = "media" | "groups" | "text" | "subtitles" | "music" | "brand" | "templates";
export type PreviewQuality = "auto" | "540" | "720" | "1080";

interface UpdateOpts {
  /** Push an undo step (default true). */
  history?: boolean;
  /** Merge consecutive updates with the same key (sliders, typing) into one undo step. */
  coalesce?: string;
}

interface EditorState {
  project: Project | null;
  assets: Record<ID, AssetMeta>;
  past: Project[];
  future: Project[];
  selection: Selection | null;
  activeGroupId: ID | null;
  panel: PanelId;
  panelOpen: boolean;
  zoom: number;
  previewQuality: PreviewQuality;
  saveState: "idle" | "pending" | "saved" | "error";
  exporting: boolean;

  open(project: Project, assets: AssetMeta[]): void;
  close(): void;
  update(recipe: (d: Draft<Project>) => void, opts?: UpdateOpts): void;
  /** Snapshot before a drag gesture; follow with update(..., {history:false}). */
  beginGesture(): void;
  undo(): void;
  redo(): void;
  addAssets(list: AssetMeta[]): void;
  select(sel: Selection | null): void;
  setActiveGroup(id: ID | null): void;
  setPanel(p: PanelId): void;
  togglePanel(): void;
  setZoom(z: number): void;
  setPreviewQuality(q: PreviewQuality): void;
  setExporting(v: boolean): void;
}

const HISTORY_LIMIT = 120;
let lastCoalesce: { key: string; at: number } | null = null;

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  assets: {},
  past: [],
  future: [],
  selection: null,
  activeGroupId: null,
  panel: "media",
  panelOpen: true,
  zoom: 60,
  previewQuality: "auto",
  saveState: "idle",
  exporting: false,

  open(project, assets) {
    const map: Record<ID, AssetMeta> = {};
    for (const a of assets) map[a.id] = a;
    lastCoalesce = null;
    set({
      project,
      assets: map,
      past: [],
      future: [],
      selection: null,
      activeGroupId: project.groups[0]?.id ?? null,
      saveState: "saved",
    });
  },

  close() {
    set({ project: null, assets: {}, past: [], future: [], selection: null });
  },

  update(recipe, opts = {}) {
    const cur = get().project;
    if (!cur) return;
    const next = produce(cur, (d) => {
      recipe(d);
      d.updatedAt = Date.now();
    });
    if (next === cur) return;
    const history = opts.history ?? true;
    let past = get().past;
    if (history) {
      const now = performance.now();
      const merge = opts.coalesce && lastCoalesce && lastCoalesce.key === opts.coalesce && now - lastCoalesce.at < 1200;
      if (!merge) past = [...past, cur].slice(-HISTORY_LIMIT);
      lastCoalesce = opts.coalesce ? { key: opts.coalesce, at: now } : null;
    }
    set({ project: next, past, future: history ? [] : get().future });
  },

  beginGesture() {
    const cur = get().project;
    if (!cur) return;
    lastCoalesce = null;
    set({ past: [...get().past, cur].slice(-HISTORY_LIMIT), future: [] });
  },

  undo() {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    lastCoalesce = null;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  },

  redo() {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    lastCoalesce = null;
    set({ project: future[0], past: [...past, project], future: future.slice(1) });
  },

  addAssets(list) {
    set({ assets: { ...get().assets, ...Object.fromEntries(list.map((a) => [a.id, a])) } });
  },

  select(sel) {
    set({ selection: sel });
  },
  setActiveGroup(id) {
    set({ activeGroupId: id });
  },
  setPanel(p) {
    set({ panel: p, panelOpen: get().panel === p ? !get().panelOpen : true });
  },
  togglePanel() {
    set({ panelOpen: !get().panelOpen });
  },
  setZoom(z) {
    set({ zoom: Math.min(400, Math.max(4, z)) });
  },
  setPreviewQuality(q) {
    set({ previewQuality: q });
  },
  setExporting(v) {
    set({ exporting: v });
  },
}));

/* Derived layout (memoised by reference) ------------------------- */

let memo: { p: Project | null; a: Record<ID, AssetMeta> | null; layout: Layout | null } = { p: null, a: null, layout: null };

export function getLayout(p: Project, a: Record<ID, AssetMeta>): Layout {
  if (memo.p === p && memo.a === a && memo.layout) return memo.layout;
  const layout = computeLayout(p, a);
  memo = { p, a, layout };
  return layout;
}

export function useLayout(): Layout | null {
  const p = useEditor((s) => s.project);
  const a = useEditor((s) => s.assets);
  return p ? getLayout(p, a) : null;
}

/* Autosave --------------------------------------------------------- */

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function summarize(p: Project, a: Record<ID, AssetMeta>): ProjectSummary {
  const layout = getLayout(p, a);
  const firstImage = p.groups.flatMap((g) => g.clips).find((c) => a[c.assetId]);
  return {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    duration: layout.duration,
    clipCount: layout.clips.length,
    coverAssetId: firstImage?.assetId ?? null,
  };
}

export async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const { project, assets } = useEditor.getState();
  if (!project) return;
  try {
    await saveProject(project, summarize(project, assets));
    useEditor.setState({ saveState: "saved" });
  } catch {
    useEditor.setState({ saveState: "error" });
  }
}

useEditor.subscribe((s, prev) => {
  if (!s.project || s.project === prev.project || prev.project === null) return;
  if (s.project.id !== prev.project.id) return;
  if (s.saveState !== "pending") useEditor.setState({ saveState: "pending" });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), 700);
});

window.addEventListener("beforeunload", () => {
  void flushSave();
});

/* Helpers ------------------------------------------------------------ */

export function findClip(p: Project, clipId: ID) {
  for (const g of p.groups) {
    const i = g.clips.findIndex((c) => c.id === clipId);
    if (i >= 0) return { group: g, clip: g.clips[i], index: i };
  }
  return null;
}
