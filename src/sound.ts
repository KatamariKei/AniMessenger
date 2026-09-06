export type SoundCue = "message-sent" | "message-received" | "camera" | "photo-received" | "bond-celebration" | "bond-heartbeat";

type SoundPreferences = { enabled: boolean; volume: number };

let audioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let unlockBuffer: AudioBuffer | null = null;
const lastPlayed = new Map<SoundCue, number>();

function context() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}

function normalizedVolume(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.35;
}

function tone(ctx: AudioContext, destination: AudioNode, start: number, duration: number, frequency: number, gain: number, type: OscillatorType = "sine", endFrequency = frequency) {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + Math.min(0.018, duration * 0.25));
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(ctx: AudioContext, destination: AudioNode, start: number, duration: number, gain: number, highpass = 900) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.2), ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const envelope = ctx.createGain();
  source.buffer = noiseBuffer;
  filter.type = "highpass";
  filter.frequency.value = highpass;
  envelope.gain.setValueAtTime(Math.max(0.0001, gain), start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(envelope).connect(destination);
  source.start(start);
  source.stop(start + duration + 0.01);
}

export function primeSoundSystem(enabled: boolean) {
  if (!enabled) return;
  const ctx = context();
  if (!ctx || ctx.state === "closed") return;
  // iOS WebKit (including Chrome on iOS) requires an actual source to start
  // during a user gesture. resume() by itself can leave the context silent.
  if (!unlockBuffer || unlockBuffer.sampleRate !== ctx.sampleRate) unlockBuffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = unlockBuffer;
  source.connect(ctx.destination);
  source.start(0);
  source.stop(0);
  if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
}

export function playSound(cue: SoundCue, preferences: SoundPreferences, options: { preview?: boolean; allowHidden?: boolean } = {}) {
  if (!preferences.enabled || normalizedVolume(preferences.volume) <= 0) return false;
  if (!options.allowHidden && document.visibilityState !== "visible") return false;
  const now = performance.now();
  const minimumGap = cue === "message-received" ? 180 : 90;
  if (!options.preview && now - (lastPlayed.get(cue) || 0) < minimumGap) return false;
  lastPlayed.set(cue, now);
  const ctx = context();
  if (!ctx || ctx.state === "closed") return false;
  const render = () => {
    const master = ctx.createGain();
    master.gain.value = normalizedVolume(preferences.volume) * 0.24;
    master.connect(ctx.destination);
    const at = ctx.currentTime + 0.008;

    switch (cue) {
      case "message-sent":
        tone(ctx, master, at, 0.075, 540, 0.42, "sine", 720);
        tone(ctx, master, at + 0.045, 0.07, 760, 0.25, "sine", 900);
        break;
      case "message-received":
        tone(ctx, master, at, 0.105, 700, 0.34, "sine", 620);
        tone(ctx, master, at + 0.055, 0.13, 900, 0.2, "sine", 760);
        break;
      case "camera":
        // A light two-stage mechanical shutter: crisp release, then a
        // quieter closing click. Keep every layer short and above the
        // thudding low-mid range used by the earlier version.
        noise(ctx, master, at, 0.009, 0.42, 4600);
        tone(ctx, master, at, 0.011, 3600, 0.25, "triangle", 2350);
        noise(ctx, master, at + 0.024, 0.011, 0.27, 3400);
        tone(ctx, master, at + 0.024, 0.014, 2700, 0.18, "triangle", 1750);
        noise(ctx, master, at + 0.043, 0.007, 0.08, 5200);
        break;
      case "photo-received":
        tone(ctx, master, at, 0.14, 523.25, 0.22, "sine", 587.33);
        tone(ctx, master, at + 0.07, 0.16, 659.25, 0.25, "sine", 698.46);
        tone(ctx, master, at + 0.14, 0.19, 783.99, 0.21, "sine", 880);
        break;
      case "bond-celebration":
      tone(ctx, master, at, 0.17, 523.25, 0.2, "sine", 587.33);
      tone(ctx, master, at + 0.065, 0.2, 659.25, 0.25, "sine", 698.46);
      tone(ctx, master, at + 0.135, 0.23, 783.99, 0.24, "sine", 880);
      tone(ctx, master, at + 0.22, 0.3, 1046.5, 0.2, "sine", 1174.66);
      tone(ctx, master, at + 0.245, 0.24, 1318.51, 0.09, "triangle", 1396.91);
      break;
      case "bond-heartbeat":
      tone(ctx, master, at, 0.13, 112, 0.54, "sine", 58);
      tone(ctx, master, at, 0.085, 224, 0.13, "sine", 116);
      tone(ctx, master, at + 0.17, 0.17, 94, 0.48, "sine", 52);
      tone(ctx, master, at + 0.17, 0.11, 188, 0.1, "sine", 104);
      break;
    }
    window.setTimeout(() => master.disconnect(), 900);
  };
  if (ctx.state !== "running") void ctx.resume().then(render).catch(() => undefined);
  else render();
  return true;
}
