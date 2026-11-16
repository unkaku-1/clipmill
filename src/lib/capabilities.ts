export interface Capabilities {
  secure: boolean;
  webcodecs: boolean;
  fileSystem: boolean;
  offscreen: boolean;
  browser: string;
}

export function detectCapabilities(): Capabilities {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "未知浏览器";
  return {
    secure: window.isSecureContext,
    webcodecs: "VideoEncoder" in window && "VideoDecoder" in window,
    fileSystem: typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function",
    offscreen: typeof OffscreenCanvas !== "undefined",
    browser,
  };
}

export function capabilityWarning(c: Capabilities): string | null {
  if (!c.secure) return "当前不是 HTTPS 安全连接，浏览器会禁用视频编码（WebCodecs），无法导出。请用 https:// 或 localhost 访问。";
  if (!c.webcodecs) return `当前浏览器（${c.browser}）不支持 WebCodecs 视频编码，请使用最新版 Chrome 或 Edge 桌面版。`;
  if (!c.offscreen) return "当前浏览器不支持 OffscreenCanvas，请升级到最新版 Chrome 或 Edge。";
  return null;
}
