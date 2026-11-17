import { FPS, clamp } from "@/lib/util";

type TimeListener = (t: number) => void;
type StateListener = () => void;

/** Shortest span that can be played at all (one frame). */
const MIN_PLAYABLE = 1 / FPS;
/** How long a user-facing hint stays visible. */
const NOTICE_MS = 3200;

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
  /** Transient user-facing hint (e.g. an empty project cannot be previewed). */
  notice: string | null = null;
  private timeListeners = new Set<TimeListener>();
  private stateListeners = new Set<StateListener>();
  private raf = 0;
  private baseTime = 0;
  private basePerf = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

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
  getNotice = () => this.notice;
  subscribeState = (fn: StateListener) => this.onState(fn);

  /**
   * Durations come from project config and media metadata, so they can be
   * `Infinity`/`NaN`/negative. A non-finite duration would make the clock run
   * forever (or produce an invalid time), so it is normalized to "not playable".
   */
  setDuration(d: number) {
    const next = Number.isFinite(d) && d > 0 ? d : 0;
    this.duration = next;
    if (!Number.isFinite(this.time) || this.time < 0) this.time = 0;
    if (this.time > next) this.seek(next);
    // A zero (or corrupt) span cannot play: stop an in-flight clock immediately.
    if (next <= 0 && this.playing) this.stop();
  }

  play() {
    if (this.playing) return;
    const duration = this.duration;
    if (!Number.isFinite(duration) || duration <= MIN_PLAYABLE) {
      // Nothing playable (empty project / corrupt duration): never start a clock
      // that could not stop on its own.
      this.time = 0;
      this.emitTime();
      this.setNotice("先添加素材，再预览播放");
      return;
    }
    if (!Number.isFinite(this.time) || this.time >= duration - MIN_PLAYABLE) this.time = 0;
    this.playing = true;
    this.baseTime = this.time;
    this.basePerf = performance.now();
    this.setNotice(null);
    this.emitState();
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    // Land on a frame boundary so the paused frame equals an exported frame.
    this.time = Number.isFinite(this.time) ? Math.round(this.time * FPS) / FPS : 0;
    this.emitState();
    this.emitTime();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    const max = Number.isFinite(this.duration) && this.duration > 0 ? this.duration : 0;
    this.time = Number.isFinite(t) ? clamp(t, 0, max) : 0;
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

  /** Show a short-lived hint; re-rendering is driven by the state listeners. */
  setNotice(message: string | null) {
    if (this.notice === message) return;
    this.notice = message;
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    if (message) {
      this.noticeTimer = setTimeout(() => {
        this.noticeTimer = null;
        this.notice = null;
        this.emitState();
      }, NOTICE_MS);
    }
    this.emitState();
  }

  /** Stop at the current position (or at the end) without landing on a frame. */
  private stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (!Number.isFinite(this.time)) this.time = 0;
    this.emitState();
    this.emitTime();
  }

  private tick = (now: number) => {
    if (!this.playing) return;
    const duration = this.duration;
    // Duration became invalid while playing: stop instead of spinning forever.
    if (!Number.isFinite(duration) || duration <= 0) {
      this.stop();
      return;
    }
    let t = this.baseTime + (now - this.basePerf) / 1000;
    if (!Number.isFinite(t)) {
      this.stop();
      return;
    }
    if (t >= duration) {
      if (this.loop && duration > 0) {
        this.baseTime = 0;
        this.basePerf = now;
        t = 0;
      } else {
        this.time = duration;
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