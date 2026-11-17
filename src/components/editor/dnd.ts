/**
 * Drag-and-drop payload types shared by the media panel, groups panel and
 * timeline. Declared in one place so the panels can talk to each other even
 * though only one of them is mounted at a time (they live in separate tabs).
 */
export const ASSET_DRAG_TYPE = "text/clipmill-asset";