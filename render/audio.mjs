// The quiet audio bed under every Reel the renderer makes: original audio written here, note by note,
// so Rhea owns it outright (no samples, no licensed music, nothing downloaded).
//
// Why: Instagram says it shows "reels that are muted" to fewer people ("Instagram Ranking Explained",
// about.instagram.com, 2023), and until October 20, 2026 every Reel carried a silent track. The bed is
// a soft four-chord pad (F major 7, D minor 9, B-flat major 7, C 6) with a light mallet line on top,
// 76 beats a minute, mastered quiet (-28 dB RMS by default, about -25 LUFS, against -14 for typical
// music; peaks under -10 dBFS; brand.json audioBed.levelDb), faded in over half a
// second and out over the last 1.6 seconds. It is a floor, not a soundtrack: the founder can still turn
// it down in Instagram's editor and add licensed music when he re-posts from the Desktop copy.
//
//   import { writeBed } from './audio.mjs'; writeBed('bed.wav', 24.0)   // 48 kHz stereo 16-bit WAV
//   node render/audio.mjs out.wav 24                                    // the same from the command line
//
// Deterministic: the same length gives the same bytes, so a re-render changes nothing it shouldn't.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_RATE = 48000;
const BPM = 76;
const BEAT = 60 / BPM;
const CHORD_BEATS = 4; // one chord per bar
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Pad voicings (MIDI notes) around middle C, where a phone speaker still sounds full, and a mallet
// figure an octave up (chord tones, one per beat)
const CHORDS = [
  { pad: [53, 57, 60, 64], mallet: [65, 72, 69, 76] }, // F maj7
  { pad: [50, 53, 57, 64], mallet: [62, 69, 65, 72] }, // D min9 (no root doubling)
  { pad: [46, 50, 53, 57], mallet: [58, 65, 62, 69] }, // B-flat maj7
  { pad: [48, 52, 55, 57], mallet: [60, 67, 64, 69] }, // C6
];

/** One bed of `seconds`, as interleaved stereo float samples in [-1, 1]. */
export function bedSamples(seconds, { level = -28 } = {}) {
  const n = Math.max(1, Math.round(seconds * SAMPLE_RATE));
  const left = new Float64Array(n), right = new Float64Array(n);
  const bar = BEAT * CHORD_BEATS;
  const fade = 1.1; // pad crossfade between chords, seconds
  // Pad: each chord sounds from its bar's start minus the crossfade to its end plus the crossfade, with a
  // raised-cosine envelope, so one chord melts into the next
  for (let b = 0; b * bar < seconds + fade; b++) {
    const chord = CHORDS[b % CHORDS.length];
    const t0 = b * bar - fade / 2, t1 = (b + 1) * bar + fade / 2;
    const s0 = Math.max(0, Math.floor(t0 * SAMPLE_RATE)), s1 = Math.min(n, Math.ceil(t1 * SAMPLE_RATE));
    chord.pad.forEach((note, v) => {
      const f = hz(note);
      const pan = v % 2 ? 0.62 : 0.38; // alternate voices a little left and right
      for (let s = s0; s < s1; s++) {
        const t = s / SAMPLE_RATE;
        const into = t - t0, left_ = t1 - t;
        const env = Math.min(1, into / fade, left_ / fade);
        const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, env));
        const breathe = 1 + 0.12 * Math.sin(2 * Math.PI * 0.09 * t + v);
        // Two slightly detuned sines and a touch of the second harmonic: warm, never buzzy
        const x = Math.sin(2 * Math.PI * (f - 0.18) * t) + Math.sin(2 * Math.PI * (f + 0.18) * t + 1.3) + 0.14 * Math.sin(2 * Math.PI * 2 * f * t);
        const y = 0.16 * e * breathe * x;
        left[s] += y * (1 - pan);
        right[s] += y * pan;
      }
    });
  }
  // Mallet: one soft note a beat, a quick attack and a 0.9 s decay, alternating sides
  for (let k = 0; k * BEAT < seconds; k++) {
    const chord = CHORDS[Math.floor(k / CHORD_BEATS) % CHORDS.length];
    const f = hz(chord.mallet[k % CHORD_BEATS]);
    const accent = k % CHORD_BEATS === 0 ? 1 : 0.7;
    const pan = k % 2 ? 0.66 : 0.34;
    const s0 = Math.floor(k * BEAT * SAMPLE_RATE), s1 = Math.min(n, s0 + Math.round(2.4 * SAMPLE_RATE));
    for (let s = s0; s < s1; s++) {
      const t = (s - s0) / SAMPLE_RATE;
      const env = Math.min(1, t / 0.006) * Math.exp(-t / 0.9);
      const x = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * 4 * f * t) * Math.exp(-t / 0.12);
      const y = 0.11 * accent * env * x;
      left[s] += y * (1 - pan);
      right[s] += y * pan;
    }
  }
  // Master: fade in and out, then set the RMS level and keep the peaks well under full scale
  const fadeIn = 0.5, fadeOut = Math.min(1.6, seconds / 3);
  let sum = 0, peak = 0;
  for (let s = 0; s < n; s++) {
    const t = s / SAMPLE_RATE;
    const g = Math.min(1, t / fadeIn, (seconds - t) / fadeOut);
    const gg = Math.max(0, g) ** 2;
    left[s] *= gg; right[s] *= gg;
    sum += left[s] ** 2 + right[s] ** 2;
    peak = Math.max(peak, Math.abs(left[s]), Math.abs(right[s]));
  }
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  let gain = 10 ** (level / 20) / rms;
  const peakLimit = 10 ** (-10 / 20);
  if (peak * gain > peakLimit) gain = peakLimit / peak;
  const out = new Float64Array(2 * n);
  for (let s = 0; s < n; s++) { out[2 * s] = left[s] * gain; out[2 * s + 1] = right[s] * gain; }
  return out;
}

/** Writes the bed as a 48 kHz, 16-bit, stereo WAV file. */
export function writeBed(file, seconds, options) {
  const samples = bedSamples(seconds, options);
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([header, data]));
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, seconds] = process.argv.slice(2);
  if (!file || !(Number(seconds) > 0)) { console.error('Usage: node render/audio.mjs out.wav <seconds>'); process.exit(2); }
  writeBed(file, Number(seconds));
  console.log(`${file}: ${Number(seconds)} s`);
}
