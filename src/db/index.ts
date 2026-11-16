import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AssetMeta, ID, Project, ProjectSummary, StylePreset } from "@/types/project";

/** Variants stored for every asset. */
export type BlobVariant = "orig" | "proxy" | "thumb" | "blur";

interface ClipMillDB extends DBSchema {
  projects: { key: ID; value: Project };
  summaries: { key: ID; value: ProjectSummary; indexes: { updatedAt: number } };
  assets: { key: ID; value: AssetMeta };
  blobs: { key: string; value: Blob };
  presets: { key: ID; value: StylePreset };
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<ClipMillDB>> | null = null;

export function db() {
  if (!dbPromise) {
    dbPromise = openDB<ClipMillDB>("clipmill", 1, {
      upgrade(d) {
        d.createObjectStore("projects", { keyPath: "id" });
        const s = d.createObjectStore("summaries", { keyPath: "id" });
        s.createIndex("updatedAt", "updatedAt");
        d.createObjectStore("assets", { keyPath: "id" });
        d.createObjectStore("blobs");
        d.createObjectStore("presets", { keyPath: "id" });
        d.createObjectStore("kv");
      },
    });
    // Ask the browser not to evict our data under storage pressure.
    void navigator.storage?.persist?.().catch(() => false);
  }
  return dbPromise;
}

const blobKey = (id: ID, v: BlobVariant) => `${id}:${v}`;

/* Projects ------------------------------------------------------- */

export async function saveProject(p: Project, summary: ProjectSummary) {
  const d = await db();
  const tx = d.transaction(["projects", "summaries"], "readwrite");
  await Promise.all([tx.objectStore("projects").put(p), tx.objectStore("summaries").put(summary), tx.done]);
}

export async function loadProject(id: ID) {
  return (await db()).get("projects", id);
}

export async function listSummaries(): Promise<ProjectSummary[]> {
  const all = await (await db()).getAll("summaries");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: ID) {
  const d = await db();
  const tx = d.transaction(["projects", "summaries"], "readwrite");
  await Promise.all([tx.objectStore("projects").delete(id), tx.objectStore("summaries").delete(id), tx.done]);
  await collectGarbage();
}

/* Assets --------------------------------------------------------- */

export async function putAsset(meta: AssetMeta, blobs: Partial<Record<BlobVariant, Blob>>) {
  const d = await db();
  const tx = d.transaction(["assets", "blobs"], "readwrite");
  const jobs: Promise<unknown>[] = [tx.objectStore("assets").put(meta)];
  for (const [v, b] of Object.entries(blobs)) {
    if (b) jobs.push(tx.objectStore("blobs").put(b, blobKey(meta.id, v as BlobVariant)));
  }
  jobs.push(tx.done);
  await Promise.all(jobs);
}

export async function getAssets(ids: ID[]): Promise<AssetMeta[]> {
  const d = await db();
  const tx = d.transaction("assets");
  const res = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return res.filter((a): a is AssetMeta => !!a);
}

export async function getBlob(id: ID, v: BlobVariant): Promise<Blob | undefined> {
  return (await db()).get("blobs", blobKey(id, v));
}

/** Delete assets that are no longer referenced by any project or preset. */
export async function collectGarbage() {
  const d = await db();
  const [projects, presets, assets] = await Promise.all([d.getAll("projects"), d.getAll("presets"), d.getAllKeys("assets")]);
  const used = new Set<ID>();
  for (const p of projects) {
    p.library.forEach((id) => used.add(id));
    collectStyleRefs(p.style, used);
  }
  for (const pr of presets) collectStyleRefs(pr.style, used);
  const dead = assets.filter((id) => !used.has(id));
  if (!dead.length) return;
  const tx = d.transaction(["assets", "blobs"], "readwrite");
  for (const id of dead) {
    void tx.objectStore("assets").delete(id);
    for (const v of ["orig", "proxy", "thumb", "blur"] as BlobVariant[]) void tx.objectStore("blobs").delete(blobKey(id, v));
  }
  await tx.done;
}

function collectStyleRefs(style: Project["style"], used: Set<ID>) {
  const b = style.brand;
  if (b.logoAssetId) used.add(b.logoAssetId);
  if (b.intro.videoAssetId) used.add(b.intro.videoAssetId);
  if (b.outro.videoAssetId) used.add(b.outro.videoAssetId);
}

/* Presets ("modes") ------------------------------------------------ */

export async function listPresets(): Promise<StylePreset[]> {
  const all = await (await db()).getAll("presets");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function savePreset(p: StylePreset) {
  const d = await db();
  if (p.isDefault) {
    const all = await d.getAll("presets");
    const tx = d.transaction("presets", "readwrite");
    for (const other of all) if (other.id !== p.id && other.isDefault) void tx.store.put({ ...other, isDefault: false });
    void tx.store.put(p);
    await tx.done;
  } else {
    await d.put("presets", p);
  }
}

export async function deletePreset(id: ID) {
  await (await db()).delete("presets", id);
  await collectGarbage();
}

/* Key-value settings ---------------------------------------------- */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const v = await (await db()).get("kv", key);
  return (v as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await (await db()).put("kv", value, key);
}

export async function storageEstimate() {
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
