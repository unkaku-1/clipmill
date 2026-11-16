import { FPS, clamp } from "@/lib/util";

type TimeListener = (t: number) => void;
type StateListener = () => void;

/**
 * The preview clock. Time updates are pushed to imperative listeners
 * (canvas, playhead, timecode) and never go through React state, so playback
 * does not trigger component re-renders.
 */
class Transport {
  time = 0;
  playing = false;
  duration = 0;
  loop = false;
  private timeListeners = new Set<TimeListener>();
  private stateListeners = new Set<StateListener>();
  private raf = 0;
  private baseTime = 0;
  private basePerf = 0;

  onTime(fn: TimeListener) {
    this.timeListeners.add(fn);
    return () => {
      this.timeListeners.delete(fn);
    };
  }

  onState(fn: StateListener) {
    this.stateListeners.add(fn);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  /** For useSyncExternalStore. */
  getPlaying = () => this.playing;
  subscribeState = (fn: StateListener) => this.onState(fn);

  setDuration(d: number) {
    this.duration = d;
    if (this.time > d) this.seek(d);
  }

  play() {
    if (this.playing) return;
    if (this.time >= this.duration - 1 / FPS) this.time = 0;
    this.playing = true;
    this.baseTime = this.time;
    this.basePerf = performance.now();
    this.emitState();
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    // Land on a frame boundary so the paused frame equals an exported frame.
    this.time = Math.round(this.time * FPS) / FPS;
    this.emitState();
    this.emitTime();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    this.time = clamp(t, 0, Math.max(0, this.duration));
    if (this.playing) {
      this.baseTime = this.time;
      this.basePerf = performance.now();
    }
    this.emitTime();
  }

  step(frames: number) {
    this.pause();
    this.seek(Math.round(this.time * FPS + frames) / FPS);
  }

  private tick = (now: number) => {
    if (!this.playing) return;
    let t = this.baseTime + (now - this.basePerf) / 1000;
    if (t >= this.duration) {
      if (this.loop && this.duration > 0) {
        this.baseTime = 0;
        this.basePerf = now;
        t = 0;
      } else {
        this.time = this.duration;
        this.playing = false;
        this.emitState();
        this.emitTime();
        return;
      }
    }
    this.time = t;
    this.emitTime();
    this.raf = requestAnimationFrame(this.tick);
  };

  private emitTime() {
    for (const fn of this.timeListeners) fn(this.time);
  }

  private emitState() {
    for (const fn of this.stateListeners) fn();
  }
}

export const transport = new Transport();
