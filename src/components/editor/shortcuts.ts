import { useEffect } from "react";
import { useEditor } from "@/store/editor";
import { transport } from "@/engine/transport";
import { useDialogs } from "@/components/editor/dialogs";
import { removeSelected } from "@/components/editor/actions";

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
};

export function useEditorShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const dialogOpen = useDialogs.getState().dialog !== null;
      if (dialogOpen) return;

      if (e.code === "Space" && !mod) {
        e.preventDefault();
        transport.toggle();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        transport.step(e.key === "ArrowLeft" ? -step : step);
        return;
      }
      if (e.key === "Home") {
        transport.pause();
        transport.seek(0);
        return;
      }
      if (e.key === "End") {
        transport.pause();
        transport.seek(transport.duration);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const sel = st.selection;
        if (sel?.kind === "clip") {
          st.update((d) => {
            for (const g of d.groups) {
              const i = g.clips.findIndex((c) => c.id === sel.id);
              if (i >= 0) {
                const copy = structuredClone(g.clips[i]);
                copy.id = `c_${Math.random().toString(36).slice(2, 10)}`;
                g.clips.splice(i + 1, 0, copy);
                break;
              }
            }
          });
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (st.selection) {
          e.preventDefault();
          removeSelected();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
