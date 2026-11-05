let ctx: AudioContext | null = null,
  ambience: GainNode | null = null,
  oscillators: OscillatorNode[] = [];
export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}
export function stopAudio() {
  ambience?.disconnect();
  ambience = null;
  oscillators.forEach((o) => o.stop());
  oscillators = [];
}
export function music(on: boolean) {
  stopAudio();
  if (!on || !ctx || document.hidden) return;
  ambience = ctx.createGain();
  ambience.gain.value = 0.008;
  ambience.connect(ctx.destination);
  for (const f of [130.81, 164.81, 196, 261.63]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(ambience);
    o.start();
    oscillators.push(o);
  }
}
export function sound(kind: "confirm" | "coffee" | "finish", on: boolean) {
  if (!on || !ctx || document.hidden) return;
  const notes =
    kind === "finish"
      ? [392, 493.88, 587.33]
      : kind === "coffee"
        ? [130, 160, 190]
        : [523.25, 659.25];
  notes.forEach((freq, i) => {
    const o = ctx!.createOscillator(),
      gain = ctx!.createGain(),
      start = ctx!.currentTime + i * 0.12;
    o.type = kind === "coffee" ? "triangle" : "sine";
    o.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.035, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    o.connect(gain);
    gain.connect(ctx!.destination);
    o.start(start);
    o.stop(start + 0.32);
  });
}
