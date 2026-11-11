import { writeFileSync, readFileSync } from 'node:fs';

// A louder, sustained four-pulse alarm with smooth edges and no clipped samples.
// A silent introduction lets Safari unlock the player without sounding an alarm.
const rate = 22050;
const duration = 2.8;
const samples = new Float64Array(Math.round(rate * duration));
for (let i = 0; i < samples.length; i++) {
  const time = i / rate;
  for (const [start, frequency] of [
    [0.18, 880],
    [0.78, 1175],
    [1.38, 880],
    [1.98, 1175],
  ]) {
    const t = time - start;
    if (t < 0 || t >= 0.48) continue;
    const envelope = Math.min(t / 0.012, 1) * Math.min((0.48 - t) / 0.04, 1);
    samples[i] = envelope * Math.tanh(2.2 * Math.sin(2 * Math.PI * frequency * t));
  }
}
const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
for (let i = 0; i < samples.length; i++)
  wav.writeInt16LE(Math.round((samples[i] / peak) * 0.94 * 32767), 44 + i * 2);
writeFileSync(new URL('../apps/web/public/rest-alarm-v2.wav', import.meta.url), wav);
const rms = (buffer) => {
  let total = 0;
  for (let i = 44; i < buffer.length; i += 2) total += (buffer.readInt16LE(i) / 32767) ** 2;
  return Math.sqrt(total / ((buffer.length - 44) / 2));
};
const previous = readFileSync(new URL('../apps/web/public/rest-alarm.wav', import.meta.url));
console.info(
  `Alarm generated: ${duration}s, peak 94%, average level +${(20 * Math.log10(rms(wav) / rms(previous))).toFixed(1)} dB versus the previous file.`,
);
