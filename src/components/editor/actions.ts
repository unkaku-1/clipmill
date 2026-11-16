import type { Draft } from "immer";
import type { AssetMeta, Clip, Group, ID, Project, TextItem } from "@/types/project";
import { useEditor, findClip } from "@/store/editor";
import { transport } from "@/engine/transport";
import { createClip, createGroup, createTextItem } from "@/lib/defaults";
import { GROUP_COLORS } from "@/engine/catalog";
import { uid, clamp } from "@/lib/util";
import { toast } from "@/components/ui/feedback";
import { computeLayout } from "@/engine/timeline";

const st = () => useEditor.getState();

export function addAssetsToGroup(assetIds: ID[], groupId?: ID | null) {
  const { assets } = st();
  st().update((d) => {
    let group = d.groups.find((g) => g.id === (groupId ?? st().activeGroupId)) ?? d.groups[d.groups.length - 1];
    if (!group) {
      const g = createGroup("第一组", d.groups.length);
      d.groups.push(g);
      group = d.groups[d.groups.length - 1];
    }
    for (const id of assetIds) {
      const a = assets[id];
      if (!a || a.kind === "audio") continue;
      group.clips.push(createClip(a, d.style as Project["style"]));
    }
  });
}

/** Remove assets from the project library and from every group, then clean unreferenced blobs. */
export function removeLibraryAssets(ids: ID[]) {
  const set = new Set(ids);
  const { project } = st();
  if (!project) return;
  const inUse = project.groups.some((g) => g.clips.some((c) => set.has(c.assetId)));
  st().update((d) => {
    d.library = d.library.filter((id) => !set.has(id));
    for (const g of d.groups) g.clips = g.clips.filter((c) => !set.has(c.assetId));
    d.audio = d.audio.filter((a) => !set.has(a.assetId));
  });
  if (inUse) toast("已从素材库和时间线移除", "info");
  void import("@/db").then((m) => m.collectGarbage()).catch(() => undefined);
}

export function addGroup(name?: string) {
  const count = st().project?.groups.length ?? 0;
  let id = "";
  st().update((d) => {
    const g = createGroup(name ?? `${count + 1}月`, count);
    g.color = GROUP_COLORS[count % GROUP_COLORS.length];
    d.groups.push(g);
    id = g.id;
  });
  st().setActiveGroup(id);
  return id;
}

export function deleteGroup(groupId: ID) {
  st().update((d) => {
    d.groups = d.groups.filter((g) => g.id !== groupId);
  });
  const p = st().project;
  if (st().activeGroupId === groupId) st().setActiveGroup(p?.groups[0]?.id ?? null);
}

export function moveGroup(groupId: ID, toIndex: number) {
  st().update((d) => {
    const i = d.groups.findIndex((g) => g.id === groupId);
    if (i < 0) return;
    const [g] = d.groups.splice(i, 1);
    d.groups.splice(clamp(toIndex, 0, d.groups.length), 0, g);
  });
}

export function removeClips(ids: ID[]) {
  const set = new Set(ids);
  st().update((d) => {
    for (const g of d.groups) g.clips = g.clips.filter((c) => !set.has(c.id));
  });
  st().select(null);
}

/** Move a clip to another group at a specific index. */
export function moveClip(clipId: ID, toGroupId: ID, toIndex: number) {
  st().update((d) => {
    let clip: Clip | null = null;
    for (const g of d.groups) {
      const i = g.clips.findIndex((c) => c.id === clipId);
      if (i >= 0) {
        clip = g.clips.splice(i, 1)[0];
        break;
      }
    }
    const target = d.groups.find((g) => g.id === toGroupId);
    if (!clip || !target) return;
    target.clips.splice(clamp(toIndex, 0, target.clips.length), 0, clip);
  });
}

export function splitClipAt(clipId: ID, t: number) {
  const p = st().project;
  if (!p) return;
  const found = findClip(p, clipId);
  if (!found) return;
  const { group, clip, index } = found;
  // Work out where t falls inside this clip using the computed layout.
  const layout = st().project ? computeDurationMap() : null;
  if (!layout) return;
  const seg = layout.get(clipId);
  if (!seg) return;
  const local = t - seg.start;
  if (local < 0.2 || clip.duration - local < 0.2) {
    toast("播放头要落在素材中间才能拆分", "info");
    return;
  }
  st().update((d) => {
    const g = d.groups.find((x) => x.id === group.id);
    if (!g) return;
    const c = g.clips[index];
    const right = structuredClone(c);
    right.id = uid("c");
    right.duration = c.duration - local;
    right.trimIn = c.trimIn + local;
    right.transition = { type: "cut", duration: 0 };
    c.duration = local;
    g.clips.splice(index + 1, 0, right);
  });
}

function computeDurationMap() {
  const { project, assets } = st();
  if (!project) return null;
  const layout = computeLayout(project, assets);
  return new Map(layout.clips.map((s) => [s.key, s]));
}

export function addTextItem(text = "新标题") {
  const { project } = st();
  if (!project) return;
  const t = transport.time;
  let id = "";
  st().update((d) => {
    const item = createTextItem(Math.round(t * 60) / 60, d.style as Project["style"], text);
    d.texts.push(item);
    id = item.id;
  });
  st().select({ kind: "text", id });
}

export function addMonthTitle() {
  addTextItem("11月");
}

export function duplicateText(id: ID) {
  st().update((d) => {
    const i = d.texts.findIndex((t) => t.id === id);
    if (i < 0) return;
    const copy: TextItem = structuredClone(d.texts[i]);
    copy.id = uid("t");
    copy.start += 0.5;
    d.texts.splice(i + 1, 0, copy);
  });
}

export function moveClipBy(clipId: ID, delta: number) {
  st().update((d) => {
    for (const g of d.groups) {
      const i = g.clips.findIndex((c) => c.id === clipId);
      if (i < 0) continue;
      const j = clamp(i + delta, 0, g.clips.length - 1);
      if (i === j) return;
      const [c] = g.clips.splice(i, 1);
      g.clips.splice(j, 0, c);
      return;
    }
  });
}

export function removeSelected() {
  const sel = st().selection;
  if (!sel) return;
  const { project } = st();
  if (!project) return;
  switch (sel.kind) {
    case "clip":
      removeClips([sel.id]);
      break;
    case "text":
      st().update((d) => {
        d.texts = d.texts.filter((t) => t.id !== sel.id);
      });
      st().select(null);
      break;
    case "group": {
      const g = project.groups.find((x) => x.id === sel.id);
      if (g && confirm(`删除分组「${g.name}」及其中 ${g.clips.length} 个素材？`)) deleteGroup(sel.id);
      break;
    }
    case "cue-top":
    case "cue-bottom":
      st().update((d) => {
        const arr = sel.kind === "cue-top" ? d.subtitles.top : d.subtitles.bottom;
        const i = arr.findIndex((c) => c.id === sel.id);
        if (i >= 0) arr.splice(i, 1);
      });
      st().select(null);
      break;
    case "audio":
      st().update((d) => {
        d.audio = d.audio.filter((a) => a.id !== sel.id);
      });
      st().select(null);
      break;
    case "caption":
    case "logo":
    case "intro":
    case "outro":
    case "title":
    case "sub-top":
    case "sub-bottom":
      st().select(null);
      break;
  }
}

/** Insert the current library assets into a group in one go. */
export function fillGroup(group: Group, assets: AssetMeta[], project: Project) {
  st().update((d) => {
    const g = d.groups.find((x) => x.id === group.id);
    if (!g) return;
    for (const a of assets) g.clips.push(createClip(a, project.style));
  });
}

export function updateGroup(d: Draft<Project>, id: ID, fn: (g: Draft<Group>) => void) {
  const g = d.groups.find((x) => x.id === id);
  if (g) fn(g);
}
