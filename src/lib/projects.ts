import type { AssetMeta, ID, Project, StylePreset } from "@/types/project";
import { createClip, createDefaultStyle, createGroup, createProject, createTextItem } from "@/lib/defaults";
import { getAssets, listPresets, loadProject, saveProject, savePreset } from "@/db";
import { importFile, importFromUrl } from "@/engine/importer";
import { distribute, parseLrc } from "@/subtitles/parse";
import { flushSave, summarize, useEditor } from "@/store/editor";
import { transport } from "@/engine/transport";
import { computeLayout } from "@/engine/timeline";
import { uid } from "@/lib/util";

export function styleRefs(p: Project): ID[] {
  const b = p.style.brand;
  return [b.logoAssetId, b.intro.videoAssetId, b.outro.videoAssetId].filter((x): x is ID => !!x);
}

export async function openProject(id: ID): Promise<boolean> {
  const p = await loadProject(id);
  if (!p) return false;
  const assets = await getAssets([...new Set([...p.library, ...styleRefs(p)])]);
  useEditor.getState().open(p, assets);
  seekToPreview(p, Object.fromEntries(assets.map((a) => [a.id, a])));
  return true;
}

/** Park the playhead on something worth looking at instead of a black first frame. */
function seekToPreview(p: Project, assets: Record<ID, AssetMeta>) {
  const layout = computeLayout(p, assets);
  transport.setDuration(layout.duration);
  const firstClip = layout.clips[0];
  const t = firstClip ? firstClip.cutIn + Math.min(0.6, (firstClip.cutOut - firstClip.cutIn) / 3) : layout.duration * 0.5;
  transport.pause();
  transport.seek(Math.max(0, t));
}

async function persist(p: Project, assets: AssetMeta[]) {
  const map = Object.fromEntries(assets.map((a) => [a.id, a]));
  await saveProject(p, summarize(p, map));
}

export async function getDefaultPreset(): Promise<StylePreset | null> {
  const all = await listPresets();
  return all.find((x) => x.isDefault) ?? null;
}

export async function createNewProject(name: string, preset?: StylePreset | null): Promise<ID> {
  const p = createProject(name, preset?.style);
  await persist(p, []);
  return p.id;
}

export async function duplicateProject(id: ID): Promise<ID | null> {
  const src = await loadProject(id);
  if (!src) return null;
  const copy: Project = structuredClone(src);
  copy.id = uid("p");
  copy.name = `${src.name} 副本`;
  copy.createdAt = copy.updatedAt = Date.now();
  const assets = await getAssets(copy.library);
  await persist(copy, assets);
  return copy.id;
}

export async function renameProject(id: ID, name: string) {
  const p = await loadProject(id);
  if (!p) return;
  const next = { ...p, name, updatedAt: Date.now() };
  await persist(next, await getAssets(next.library));
}

export async function leaveEditor() {
  await flushSave();
  useEditor.getState().close();
}

export async function saveStyleAsPreset(name: string, style: Project["style"], isDefault: boolean): Promise<StylePreset> {
  const preset: StylePreset = { id: uid("m"), name, createdAt: Date.now(), isDefault, style: structuredClone(style) };
  await savePreset(preset);
  return preset;
}

/* ------------------------------------------------------------------ */
/* Sample project                                                      */
/* ------------------------------------------------------------------ */

const SAMPLE_LRC = `[ti:十一月 · 团队回顾]
[00:07.20]秋天的风，吹过山顶
[00:07.20]The autumn wind blows across the summit
[00:11.40]我们一起走过的路
[00:11.40]Every trail we walked together
[00:15.60]把经验写进每一页分享
[00:15.60]We turned lessons into shared pages
[00:19.80]也把烟火气留在餐桌上
[00:19.80]And left the warmth on the dinner table
[00:24.00]下个月，继续出发
[00:24.00]Next month, we set off again
[00:28.00]`;

function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const bytes = 44 + len * ch * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

/** Synthesize a calm 4-chord pad so the sample has a music bed (no licensing worries). */
async function synthMusic(seconds: number): Promise<File> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  const chords = [
    [220.0, 277.18, 329.63, 440.0], // A
    [196.0, 246.94, 293.66, 392.0], // G
    [174.61, 220.0, 261.63, 349.23], // F
    [196.0, 246.94, 329.63, 392.0], // Gsus-ish
  ];
  const bar = 4;
  for (let t = 0, i = 0; t < seconds; t += bar, i++) {
    const notes = chords[i % chords.length];
    notes.forEach((f, n) => {
      const osc = ctx.createOscillator();
      osc.type = n === 0 ? "triangle" : "sine";
      osc.frequency.value = f;
      const pan = ctx.createStereoPanner();
      pan.pan.value = (n - 1.5) / 3;
      const g = ctx.createGain();
      const end = Math.min(seconds, t + bar + 0.6);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.8);
      g.gain.setValueAtTime(0.25, end - 1.0);
      g.gain.linearRampToValueAtTime(0, end);
      osc.connect(g).connect(pan).connect(master);
      osc.start(t);
      osc.stop(end);
    });
    // Soft pluck on every beat
    for (let b = 0; b < bar; b++) {
      const at = t + b;
      if (at >= seconds - 0.5) break;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = notes[(b + i) % notes.length] * 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      osc.connect(g).connect(master);
      osc.start(at);
      osc.stop(at + 1);
    }
  }
  const rendered = await ctx.startRendering();
  return new File([encodeWav(rendered)], "示例配乐-秋日.wav", { type: "audio/wav" });
}

const SAMPLE_GROUPS: { name: string; files: [string, string][] }[] = [
  { name: "秋日登山", files: [["autumn-cover.jpg", "湖畔秋色"], ["hike-1.jpg", "登山小队"], ["hike-2.jpg", "山顶合影"]] },
  { name: "技术分享会", files: [["talk-1.jpg", "网络架构分享"], ["talk-2.jpg", "机房整理"]] },
  { name: "顺德美食", files: [["food-1.jpg", "秋日晚宴"], ["food-2.jpg", "夜市烟火"]] },
];

export async function createSampleProject(onStep?: (msg: string) => void): Promise<ID> {
  const base = import.meta.env.BASE_URL;
  const style = createDefaultStyle();
  const p = createProject("示例 · 十一月团队回顾", style);
  p.title = { title: "十一月 · 团队回顾", subtitle: "登山 · 分享会 · 顺德美食" };
  p.style.brand.name = "云鹤工作室";
  p.style.brand.slogan = "记录每一次出发";
  p.style.brand.outro.subtitle = "我们十二月见";
  p.groups = [];
  const assets: AssetMeta[] = [];

  onStep?.("导入示例 Logo…");
  const logo = await importFromUrl(`${base}favicon.svg`, "clipmill-logo.svg", "image");
  assets.push(logo);
  p.style.brand.logoAssetId = logo.id;

  let gi = 0;
  for (const g of SAMPLE_GROUPS) {
    const group = createGroup(g.name, gi++);
    for (const [file, name] of g.files) {
      onStep?.(`导入示例素材：${name}`);
      const a = await importFromUrl(`${base}samples/${file}`, `${name}.jpg`, "image");
      a.name = name;
      assets.push(a);
      p.library.push(a.id);
      group.clips.push(createClip(a, p.style));
    }
    p.groups.push(group);
  }

  onStep?.("合成示例配乐…");
  const music = await importFile(await synthMusic(34));
  assets.push(music);
  p.library.push(music.id);
  p.audio.push({ id: uid("m"), assetId: music.id, start: 0, trimIn: 0, duration: music.duration, volume: 0.8, fadeIn: 1, fadeOut: 2.5 });

  // Bilingual lyrics: Chinese on the bottom, English on top.
  const cues = distribute(parseLrc(SAMPLE_LRC, 30), "bi-bottom-first");
  p.subtitles = cues;

  const month = createTextItem(7.2, p.style, "11月");
  month.duration = 20;
  p.texts.push(month);

  // Varied transitions for the demo.
  const demo: [string, number][] = [
    ["fade", 0.6],
    ["zoom-in", 0.7],
    ["push-left", 0.6],
    ["iris", 0.7],
    ["wipe-right", 0.6],
    ["blinds", 0.7],
    ["fade-white", 0.6],
  ];
  p.groups.flatMap((g) => g.clips).forEach((c, i) => {
    const [type, d] = demo[i % demo.length];
    c.transition = { type: type as never, duration: d };
  });

  await persist(p, assets);
  return p.id;
}

export async function addFilesToProject(files: File[], opts: { groupId?: ID | null; onProgress?: (done: number, total: number, name: string) => void }) {
  const { project } = useEditor.getState();
  if (!project) return { added: [] as AssetMeta[], errors: [] as string[] };
  const added: AssetMeta[] = [];
  const errors: string[] = [];
  let done = 0;
  // Import a few at a time: decoding many photos at once spikes memory.
  const queue = [...files];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const f = queue.shift()!;
      try {
        const a = await importFile(f);
        added.push(a);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      opts.onProgress?.(++done, files.length, f.name);
    }
  });
  await Promise.all(workers);
  // Keep the user's file order.
  const order = new Map(files.map((f, i) => [f.name.replace(/\.[^.]+$/, ""), i]));
  added.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));

  const st = useEditor.getState();
  st.addAssets(added);
  st.update((d) => {
    for (const a of added) d.library.push(a.id);
    let group = d.groups.find((g) => g.id === (opts.groupId ?? st.activeGroupId)) ?? d.groups[d.groups.length - 1];
    for (const a of added) {
      if (a.kind === "audio") {
        const end = d.audio.reduce((m, x) => Math.max(m, x.start + x.duration), 0);
        d.audio.push({ id: uid("m"), assetId: a.id, start: end, trimIn: 0, duration: a.duration, volume: 0.8, fadeIn: 0.5, fadeOut: 2 });
        continue;
      }
      if (!group) {
        const g = createGroup("第一组", d.groups.length);
        d.groups.push(g);
        group = d.groups[d.groups.length - 1];
      }
      group.clips.push(createClip(a, d.style as Project["style"]));
    }
  });
  return { added, errors };
}
