import { useEffect, useRef } from "react";
import type { TextAnimSpec, TextStyle } from "@/types/project";
import { drawText } from "@/engine/text";
import { onFontsLoaded } from "@/lib/fonts";

/**
 * Live canvas preview of a text style + entrance animation (loops while visible).
 */
export function TextPreview({
  text,
  style,
  anim,
  height = 64,
  width = 280,
}: {
  text: string;
  style: TextStyle;
  anim?: TextAnimSpec | null;
  height?: number;
  width?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const styleRef = useRef(style);
  const textRef = useRef(text);
  styleRef.current = style;
  textRef.current = text;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(width * dpr));
    const ch = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let start = performance.now();
    const inDur = anim?.in && anim.in !== "none" ? anim.inDur : 0;
    const outDur = anim?.out && anim.out !== "none" ? anim.outDur : 0;
    const hold = 1.2;
    const total = inDur + hold + outDur + 0.4;
    const draw = (now: number) => {
      const t = ((now - start) / 1000) % total;
      const s = styleRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const scale = Math.min(cw / width, ch / height) * dpr;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const local = t < total - 0.4 ? t : 0;
      const dur = inDur + hold + outDur;
      try {
        drawText(ctx, textRef.current, { ...s, align: "center" }, scale, width / 2, height / 2, {
          local,
          dur,
          anim: anim ? { in: anim.in, out: anim.out, inDur, outDur } : null,
          maxWidth: width - 16,
        });
      } catch {
        // ignore transient drawing errors (e.g. fonts loading)
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const off = onFontsLoaded(() => {
      start = performance.now();
    });
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  }, [width, height, anim?.in, anim?.out, anim?.inDur, anim?.outDur]);

  return <canvas ref={ref} style={{ width, height }} className="mx-auto block" />;
}
