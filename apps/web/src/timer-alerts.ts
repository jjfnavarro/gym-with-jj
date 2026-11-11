// Reuse one media element: Safari grants playback permission to the element
// during a tap. A new AudioContext after reload has no such permission.
export class TimerSound {
  private audio: HTMLAudioElement | null = null;
  private primed = false;
  private priming: Promise<boolean> | null = null;
  private generation = 0;
  private playbackRequested = false;
  private needsReload = false;

  private element() {
    if (!this.audio) {
      this.audio = new Audio('/rest-alarm-v2.wav');
      this.audio.preload = 'auto';
      this.audio.volume = 1;
      this.audio.setAttribute('playsinline', '');
    }
    return this.audio;
  }

  // Call synchronously from a tap, before any IndexedDB or network awaits.
  // The alarm starts with silence; stop as soon as playback starts so enabling
  // alerts doesn't sound an alarm. Don't mute: that wouldn't unlock sound.
  unlock(): Promise<boolean> {
    if (this.primed) return Promise.resolve(true);
    // Starting playback isn't evidence that the browser accepted it yet.
    if (this.playbackRequested) return Promise.resolve(false);
    if (this.priming) return this.priming;
    try {
      const audio = this.element();
      const generation = ++this.generation;
      this.priming = audio
        .play()
        .then(() => {
          if (generation !== this.generation) return false;
          audio.pause();
          audio.currentTime = 0;
          this.primed = true;
          return true;
        })
        .catch(() => false)
        .finally(() => {
          this.priming = null;
        });
      return this.priming;
    } catch {
      return Promise.resolve(false);
    }
  }

  async play(repeat = false): Promise<void> {
    const generation = ++this.generation;
    this.playbackRequested = true;
    const audio = this.element();
    audio.pause();
    if (this.needsReload) {
      // Reset a blocked/stalled media pipeline on the next explicit tap while
      // retaining Safari's permission for this same element.
      audio.load();
      this.needsReload = false;
    }
    audio.loop = repeat;
    audio.volume = 1;
    audio.currentTime = 0;
    try {
      await audio.play();
      this.primed = true;
    } catch (error) {
      // Dismissing or replacing an alarm intentionally aborts pending playback.
      if (generation !== this.generation) return;
      this.primed = false;
      this.playbackRequested = false;
      this.needsReload = true;
      throw error;
    }
  }

  stop() {
    ++this.generation;
    this.playbackRequested = false;
    if (this.audio) {
      this.audio.pause();
      this.audio.loop = false;
    }
  }
}

export const vibrationAvailable = () => typeof navigator.vibrate === 'function';
export function vibrateAlert(): boolean {
  try {
    return vibrationAvailable() && navigator.vibrate([300, 150, 300]);
  } catch {
    return false;
  }
}
