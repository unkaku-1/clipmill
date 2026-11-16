import { create } from "zustand";

export type DialogId = "export" | "subtitles" | "oneclick" | "brand" | null;

export const useDialogs = create<{ dialog: DialogId; open: (d: DialogId) => void; close: () => void }>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));
