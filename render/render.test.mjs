// Tests for the renderer's rules: timing per type, cardHash, folder/marker/index names, what render
// does with each post (render/plan.mjs), the feature scene files and recordings, and the template's
// layout for every type. Run with `node --test render/` (npm test runs it with the other tests).
// Temporary folders only; the template test needs Chrome (CHROME_PATH or Playwright's) and skips
// without it; the recording checks need ffprobe and skip without it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { timing, cardHash, typeOf, slotOf, readRecording, FEATURES_DIR } from './timing.mjs';
import { folderName, slugOfFolder, markerFile, indexFile, captionText, rebuildIndexes, isMemorialDate } from './lib.mjs';
import { planPost } from './plan.mjs';
import { checkSpec, isBlocked, sceneSeconds, BLOCKED_PATHS } from './record-feature.mjs';
import { moovFirst } from './probe.mjs';
import { bedSamples, writeBed, SAMPLE_RATE } from './audio.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));

const ownerMath = (n = 3, extra = {}) => ({
  date: '2026-11-13', slug: 'om', theme: 'ink', hook: 'Is 29.3% labor good?', term: 'Labor %', formula: 'Wages ÷ net sales',
  steps: Array.from({ length: n }, (_, i) => ({ label: `Step ${i + 1}`, value: `$${i + 1}` })),
  result: { label: 'Labor %', value: '29.3%' }, takeaway: 'Track it weekly.', caption: 'Line one\nLine two', hashtags: ['#RunonRhea'], thumbOffsetMs: 12500, ...extra,
});
const tip = (n = 3, extra = {}) => ({
  date: '2026-11-14', slot: 'morning', type: 'tip', slug: 'tp', theme: 'paper', hook: 'Do deposits match sales?', title: 'Match deposits to card days',
  lines: Array.from({ length: n }, (_, i) => `Line number ${i + 1} of the tip`), action: 'Every Monday', takeaway: 'A card day with no deposit is money owed to you.',
  caption: 'c', hashtags: [], thumbOffsetMs: 12500, ...extra,
});
const myth = (n = 3, extra = {}) => ({
  date: '2026-11-14', slot: 'evening', type: 'myth', slug: 'my', theme: 'sage', hook: 'My deposits are my sales.', fact: 'Deposits hold money that is not yours',
  why: Array.from({ length: n }, (_, i) => `Reason number ${i + 1} it is not`), takeaway: 'Book sales from the register.', caption: 'c', hashtags: [], thumbOffsetMs: 4200, ...extra,
});
const feature = (extra = {}) => ({
  date: '2026-11-15', slot: 'evening', type: 'feature', slug: 'ft', theme: 'sage-wash', headline: 'Every store side by side', sub: 'The demo group, last 30 days',
  demoNote: 'Demo company · made-up numbers', recording: 'overview-stores', cta: 'Try the demo: demo.rheafi.com', caption: 'c', hashtags: [], ...extra,
});
const fakeRecording = { frames: 360, fps: 24 };

describe('timing', () => {
  test('owner math keeps the first run\'s clock', () => {
    const expect = { 3: [538, 22.417, 12500], 4: [576, 24, 14100], 5: [614, 25.583, 15700] };
    for (const [n, [frames, duration, thumb]] of Object.entries(expect)) {
      const t = timing(ownerMath(Number(n)));
      assert.equal(t.frames, frames); assert.equal(t.duration, duration); assert.equal(t.thumbOffsetMs, thumb);
      assert.equal(t.termAt, 3); assert.equal(t.hookMoveAt, 2.6); assert.deepEqual(t.stepsAt, Array.from({ length: Number(n) }, (_, i) => 7 + i * 1.6));
    }
  });
  test('a post without type is owner math in the morning', () => {
    assert.equal(typeOf(ownerMath()), 'owner-math');
    assert.equal(slotOf(ownerMath()), 'morning');
  });
  test('tip uses the owner-math clock with its lines', () => {
    for (const [n, thumb] of [[3, 12500], [4, 14100], [5, 15700]]) assert.equal(timing(tip(n)).thumbOffsetMs, thumb);
    assert.equal(timing(tip(3)).duration, timing(ownerMath(3)).duration);
    assert.throws(() => timing(tip(2)), /3 to 5 lines/);
    assert.throws(() => timing(tip(6)), /3 to 5 lines/);
  });
  test('myth: fact at 3.5 s, cover at 4 200 ms, 2 to 4 lines', () => {
    for (const [n, duration] of [[2, 21.292], [3, 22.917], [4, 24.5]]) {
      const t = timing(myth(n));
      assert.equal(t.thumbOffsetMs, 4200); assert.equal(t.resultAt, 3.5); assert.equal(t.duration, duration);
      assert.equal(t.stepsAt[0], 7.5);
      assert.ok(Math.abs(t.takeawayAt - (7.5 + (n - 1) * 1.6 + 1.6 + 4.2)) < 1e-9);
    }
    assert.throws(() => timing(myth(1)), /2 to 4/);
    assert.throws(() => timing(myth(5)), /2 to 4/);
  });
  test('feature: recording from 1.0 s, end card 2.2 s, cover per post or 4 000 ms', () => {
    const t = timing(feature(), { recording: fakeRecording });
    assert.equal(t.recordingAt, 1); assert.equal(t.endAt, 16); assert.equal(t.frames, 437); assert.equal(t.thumbOffsetMs, 4000);
    assert.deepEqual(t.thumbRange, [1000, 16000]);
    assert.equal(timing(feature({ thumbOffsetMs: 9000 }), { recording: fakeRecording }).thumbOffsetMs, 9000);
    assert.throws(() => timing(feature({ recording: 'no-such-recording' })), /has not been recorded/);
  });
});

describe('cardHash', () => {
  test('ignores caption, hashtags, date, slot and thumbOffsetMs', () => {
    const a = ownerMath();
    const b = { ...a, caption: 'other', hashtags: ['#x'], date: '2027-01-01', slot: 'morning', thumbOffsetMs: 1 };
    assert.equal(cardHash(a), cardHash(b));
  });
  test('changes with any card field, the theme and the recording', () => {
    const a = ownerMath();
    for (const change of [{ hook: 'x' }, { theme: 'paper' }, { takeaway: 'y' }, { result: { label: 'L', value: '1%' } }, { steps: a.steps.slice(0, 2) }]) {
      assert.notEqual(cardHash(a), cardHash({ ...a, ...change }), JSON.stringify(change));
    }
    const f = feature();
    assert.notEqual(cardHash(f, { recording: 'aaa' }), cardHash(f, { recording: 'bbb' }));
    assert.notEqual(cardHash(tip()), cardHash(tip(3, { action: 'Per LLC' })));
    assert.notEqual(cardHash(myth()), cardHash(myth(3, { fact: 'Other' })));
  });
  test('no type equals owner-math, no theme equals paper, key order does not matter', () => {
    const a = ownerMath();
    assert.equal(cardHash(a), cardHash({ ...a, type: 'owner-math' }));
    const { theme, ...noTheme } = a;
    assert.equal(cardHash({ ...noTheme }), cardHash({ ...noTheme, theme: 'paper' }));
    const reversed = Object.fromEntries(Object.entries(a).reverse());
    assert.equal(cardHash(a), cardHash(reversed));
  });
});

describe('folders, markers, captions', () => {
  test('folder names per slot', () => {
    assert.equal(folderName(ownerMath()), '2026-11-13-om');
    assert.equal(folderName(myth()), '2026-11-14-evening-my');
    assert.equal(slugOfFolder('2026-11-14-evening-my', 'evening'), 'my');
    assert.equal(slugOfFolder('2026-11-14-evening-my', 'morning'), null);
    assert.equal(slugOfFolder('2026-11-13-om', 'morning'), 'om');
    assert.equal(slugOfFolder('2026-11-13-om', 'evening'), null);
  });
  test('marker and index names come from brand.json slots', () => {
    assert.equal(path.basename(markerFile(brand, '2026-10-21', 'morning', root)), '2026-10-21.json');
    assert.equal(path.basename(markerFile(brand, '2026-10-21', 'evening', root)), '2026-10-21-evening.json');
    assert.equal(path.relative(root, indexFile(brand, 'morning', root)), 'posts/index.json');
    assert.equal(path.relative(root, indexFile(brand, 'evening', root)), 'posts/index-evening.json');
  });
  test('captions: footer per type, hashtags last', () => {
    assert.ok(captionText(brand, ownerMath()).includes(brand.captionFooter));
    const f = captionText(brand, feature({ hashtags: ['#a', '#RunonRhea'] }));
    assert.ok(f.includes(brand.captionFooterFeature || brand.captionFooter));
    assert.ok(f.trimEnd().endsWith('#a #RunonRhea'));
  });
  test('memorial dates come from brand.json', () => {
    for (const d of brand.memorial.dates) assert.ok(isMemorialDate(brand, d));
    assert.ok(!isMemorialDate(brand, '2026-10-24'));
  });
});

/** A temporary repo: brand.json, content/, posts/, published/. */
function tempRepo(posts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhea-render-'));
  fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify(brand));
  fs.mkdirSync(path.join(dir, 'content'));
  fs.mkdirSync(path.join(dir, 'posts'));
  fs.mkdirSync(path.join(dir, 'published'));
  fs.writeFileSync(path.join(dir, 'content', '2026-11.json'), JSON.stringify({ month: '2026-11', posts }));
  return dir;
}
const rendered = (dir, folder, meta = {}) => {
  fs.mkdirSync(path.join(dir, 'posts', folder), { recursive: true });
  fs.writeFileSync(path.join(dir, 'posts', folder, 'reel.mp4'), 'x');
  fs.writeFileSync(path.join(dir, 'posts', folder, 'meta.json'), JSON.stringify(meta));
};
const mark = (dir, name) => fs.writeFileSync(path.join(dir, 'published', name), '{}');

describe('what render does with a post', () => {
  const plan = (dir, post, opts = {}) => planPost({ post, brand, root: dir, postsDir: path.join(dir, 'posts'), hash: cardHash(post), timing: timing(post), ...opts }).action;

  test('a posted slot is never touched, even with --force', () => {
    const p = ownerMath();
    const dir = tempRepo([p]);
    rendered(dir, folderName(p), { cardHash: 'old' });
    mark(dir, '2026-11-13.json');
    assert.equal(plan(dir, p), 'published');
    assert.equal(plan(dir, p, { force: true }), 'published');
    // the other slot's marker does not count
    const e = myth();
    mark(dir, '2026-11-14.json');
    assert.equal(plan(dir, e), 'render');
    mark(dir, '2026-11-14-evening.json');
    assert.equal(plan(dir, e), 'published');
  });
  test('a memorial date gets nothing', () => {
    const p = tip(3, { date: '2026-10-25' });
    assert.equal(plan(tempRepo([p]), p), 'memorial');
  });
  test('same cardHash: captions only; different: render; --force: render', () => {
    const p = tip();
    const dir = tempRepo([p]);
    assert.equal(plan(dir, p), 'render');
    rendered(dir, folderName(p), { cardHash: cardHash(p) });
    assert.equal(plan(dir, p), 'captions');
    assert.equal(plan(dir, { ...p, caption: 'new caption' }), 'captions');
    assert.equal(plan(dir, { ...p, action: 'Per LLC' }), 'render');
    assert.equal(plan(dir, p, { force: true }), 'render');
  });
  test('a folder rendered before cardHash adopts it when its recorded card matches', () => {
    const p = ownerMath(3);
    const dir = tempRepo([p]);
    rendered(dir, folderName(p), { slug: 'om', theme: 'ink', hook: p.hook, result: p.result, thumbOffsetMs: 12500 });
    assert.equal(plan(dir, p), 'adopt');
    assert.equal(plan(dir, { ...p, theme: 'paper' }), 'legacy-differs');
    assert.equal(plan(dir, { ...p, hook: 'Other?' }), 'legacy-differs');
    assert.equal(plan(dir, { ...p, theme: 'paper' }, { force: true }), 'render');
  });
  test('a moved date reuses the unposted folder; a posted one is never moved', () => {
    const p = myth();
    const dir = tempRepo([p]);
    rendered(dir, '2026-11-20-evening-my', { cardHash: cardHash(p) });
    const r = planPost({ post: p, brand, root: dir, postsDir: path.join(dir, 'posts'), hash: cardHash(p), timing: timing(p) });
    assert.equal(r.action, 'captions'); assert.equal(r.renameFrom, '2026-11-20-evening-my');
    mark(dir, '2026-11-20-evening.json');
    assert.equal(plan(dir, p), 'error');
    // a morning folder with the same slug is not the evening post's
    const dir2 = tempRepo([p]);
    rendered(dir2, '2026-11-20-my', { cardHash: cardHash(p) });
    assert.equal(plan(dir2, p), 'render');
  });
});

describe('indexes', () => {
  test('both slots, posted posts kept without media, memorial dates never listed', () => {
    const posts = [ownerMath(), tip(3, { slot: 'morning' }), myth(), myth(3, { date: '2026-10-25', slug: 'memo' }), feature({ date: '2026-11-16', slug: 'ft2' })];
    const dir = tempRepo(posts);
    rendered(dir, folderName(posts[0]));
    rendered(dir, folderName(posts[2]));
    rendered(dir, folderName(posts[3]));
    fs.mkdirSync(path.join(dir, 'posts', folderName(posts[4])));
    mark(dir, '2026-11-16-evening.json'); // posted, media pruned
    fs.writeFileSync(path.join(dir, 'posts', 'index.json'), JSON.stringify({ '2026-01-05': '2026-01-05-old', '2026-01-06': '2026-01-06-gone' }));
    rendered(dir, '2026-01-05-old');
    const counts = rebuildIndexes(brand, dir);
    const morning = JSON.parse(fs.readFileSync(path.join(dir, 'posts', 'index.json'), 'utf8'));
    const evening = JSON.parse(fs.readFileSync(path.join(dir, 'posts', 'index-evening.json'), 'utf8'));
    assert.deepEqual(morning, { '2026-01-05': '2026-01-05-old', '2026-11-13': '2026-11-13-om' });
    assert.deepEqual(evening, { '2026-11-14': '2026-11-14-evening-my', '2026-11-16': '2026-11-16-evening-ft2' });
    assert.deepEqual(counts, { morning: 2, evening: 2 });
  });
});

describe('feature recordings', () => {
  const specs = fs.readdirSync(FEATURES_DIR).filter((f) => f.endsWith('.json'));
  test('ten scene files, each valid, 12–18 s, nothing on the blocklist', () => {
    assert.ok(specs.length >= 10, `${specs.length} scene files`);
    for (const f of specs) {
      const id = f.slice(0, -5);
      const spec = JSON.parse(fs.readFileSync(path.join(FEATURES_DIR, f), 'utf8'));
      const { problems, total } = checkSpec(spec, id);
      assert.deepEqual(problems, [], id);
      assert.ok(total >= 12 && total <= 18, `${id}: ${total} s`);
      for (const s of spec.scenes) if (s.path) assert.ok(!isBlocked(s.path.split('?')[0]), s.path);
    }
  });
  test('the blocklist and the checks', () => {
    for (const p of BLOCKED_PATHS) { assert.ok(isBlocked(p)); assert.ok(isBlocked(`${p}/x`)); }
    assert.ok(!isBlocked('/labor')); assert.ok(!isBlocked('/accounts-overview'));
    const bad = checkSpec({ id: 'x', scenes: [{ path: '/admin', moves: [{ hold: 25 }] }] }, 'x').problems.join(' ');
    assert.match(bad, /blocklist/); assert.match(bad, /12–18 s/);
    assert.equal(sceneSeconds({ moves: [{ hold: 1 }, { scroll: 10, over: 2 }], tap: { text: 'a' } }), 3.5);
    assert.match(checkSpec({ id: 'x', scenes: [{ path: '/', moves: [{ hold: 12 }] }, { moves: [{ hold: 1 }] }] }, 'x').problems.join(' '), /does not tap/);
  });
  const ffprobe = process.env.FFPROBE || (process.env.FFMPEG ? path.join(path.dirname(process.env.FFMPEG), 'ffprobe') : 'ffprobe');
  const haveProbe = spawnSync(ffprobe, ['-version']).status === 0;
  test('every scene file has its recording: 860×1864, 24 fps, frames as frames.json says, faststart', { skip: !haveProbe && 'ffprobe not found' }, () => {
    for (const f of specs) {
      const id = f.slice(0, -5);
      const meta = readRecording(id);
      assert.ok(meta, `${id}: frames.json`);
      const mp4 = path.join(FEATURES_DIR, id, 'recording.mp4');
      assert.ok(fs.existsSync(mp4), `${id}: recording.mp4`);
      const r = spawnSync(ffprobe, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_packets,codec_name', '-of', 'json', mp4], { encoding: 'utf8' });
      const s = JSON.parse(r.stdout).streams[0];
      assert.equal(s.codec_name, 'h264'); assert.equal(s.width, 860); assert.equal(s.height, 1864); assert.equal(s.r_frame_rate, '24/1');
      assert.equal(Number(s.nb_read_packets), meta.frames, `${id}: frame count`);
      assert.ok(moovFirst(mp4), `${id}: faststart`);
      assert.equal(meta.scenes.at(-1).endFrame, meta.frames);
      const t = timing(feature({ recording: id }));
      assert.ok(t.duration >= 15 && t.duration <= 21.5, `${id}: Reel ${t.duration} s`);
    }
  });
});

describe('template layout (needs Chrome)', async () => {
  const chromePath = process.env.CHROME_PATH;
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
  let browser = null;
  if (chromium) { try { browser = await chromium.launch({ executablePath: chromePath || undefined }); } catch { browser = null; } }
  const skip = !browser && 'Chrome not found (set CHROME_PATH)';
  const layout = async (post, t) => {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root, 'render', 'template.html')).href);
    const report = await page.evaluate(({ post, t, brand }) => window.setPost(post, t, brand), { post, t, brand });
    const text = await page.evaluate(() => ({ kicker: document.getElementById('kicker').textContent, end: document.getElementById('end-sub').textContent, endShown: getComputedStyle(document.getElementById('end-sub')).display !== 'none' }));
    await page.close();
    assert.deepEqual(errors, []);
    return { report, text };
  };
  test('every type fits the frame in every theme, with its kicker', { skip }, async () => {
    for (const theme of Object.keys(brand.themes)) {
      for (const post of [ownerMath(5, { theme }), tip(5, { theme }), myth(4, { theme }), feature({ theme })]) {
        const { report, text } = await layout(post, timing(post, { recording: fakeRecording }));
        assert.equal(report.overflow, false, `${post.type || 'owner-math'} on ${theme}: ${JSON.stringify(report)}`);
        assert.equal(text.kicker, `${brand.handle.toUpperCase()} · ${brand.kickers[typeOf(post)].toUpperCase()}`);
      }
    }
  });
  test('a short tip action stays on one line; a long one wraps to two', { skip }, async () => {
    const short = await layout(tip(), timing(tip()));
    assert.equal(short.report.resultLines, 1);
    const long = await layout(tip(3, { action: 'Before payroll runs' }), timing(tip()));
    assert.ok(long.report.resultLines <= 2 && !long.report.overflow);
  });
  test('a headline too long for two lines is refused, not cut', { skip }, async () => {
    const post = feature({ headline: 'This headline is far too long to fit on two lines above the window at any size we allow', sub: 'And a sub that also runs on and on past what two lines of the sub can hold at its smallest size' });
    const { report } = await layout(post, timing(post, { recording: fakeRecording }));
    assert.equal(report.overflow, true);
  });
  test('the feature end card shows the call to action once', { skip }, async () => {
    const { text } = await layout(feature(), timing(feature(), { recording: fakeRecording }));
    assert.equal(text.endShown, false);
  });
  test('Instagram\'s overlays: text cards end by 1536 px and keep the right 150 px clear; headlines start below the grid\'s 3:4 crop', { skip }, async () => {
    for (const post of [ownerMath(5), tip(5, { action: 'Before payroll runs' }), myth(4)]) {
      const { report } = await layout(post, timing(post));
      assert.equal(report.bottomLimit, 1536);
      assert.ok(report.contentBottom <= 1536, `${typeOf(post)}: bottom ${report.contentBottom}`);
      assert.ok(report.rightEdge <= 1080 - 150, `${typeOf(post)}: right edge ${report.rightEdge}`);
      assert.ok(report.hookTop >= 236, `${typeOf(post)}: hook top ${report.hookTop}`);
    }
    // Every unposted card in the content files (the first run's rendered owner math excepted)
    for (const f of fs.readdirSync(path.join(root, 'content')).filter((x) => /^\d{4}-\d{2}\.json$/.test(x))) {
      for (const post of JSON.parse(fs.readFileSync(path.join(root, 'content', f), 'utf8')).posts) {
        if (typeOf(post) === 'feature' || !post.type) continue;
        if (fs.existsSync(markerFile(brand, post.date, slotOf(post), root))) continue;
        const { report } = await layout(post, timing(post));
        assert.equal(report.overflow, false, `${post.slug}: ${JSON.stringify(report)}`);
        assert.ok(report.contentBottom <= 1536 && report.rightEdge <= 930, `${post.slug}: ${JSON.stringify(report)}`);
      }
    }
    const { report } = await layout(feature(), timing(feature(), { recording: fakeRecording }));
    assert.deepEqual(report.window, { x: 247, y: 594, w: 586, h: 1270, r: 46 });
    assert.ok(Math.abs(586 / 1270 - 860 / 1864) < 0.0005, 'the window keeps the recordings\' aspect');
    assert.ok(report.headTop >= 244, `headline top ${report.headTop}`);
  });
  test('cleanup', { skip }, async () => { await browser.close(); });
});

describe('the audio bed (render/audio.mjs)', () => {
  test('exactly the Reel\'s length, quiet, never clipping, and the same every time', () => {
    const a = bedSamples(22.417), b = bedSamples(22.417);
    assert.equal(a.length, 2 * Math.round(22.417 * SAMPLE_RATE));
    assert.deepEqual(a.slice(0, 5000), b.slice(0, 5000));
    let sum = 0, peak = 0;
    for (const x of a) { sum += x * x; peak = Math.max(peak, Math.abs(x)); }
    const rmsDb = 10 * Math.log10(sum / a.length);
    assert.ok(Math.abs(rmsDb - -28) < 0.5, `RMS ${rmsDb.toFixed(1)} dB`);
    assert.ok(20 * Math.log10(peak) <= -10 + 1e-9, `peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
    assert.equal(a[0], 0); // fades in from silence
    assert.ok(Math.abs(a.at(-1)) < 1e-6 && Math.abs(a.at(-2)) < 1e-6); // and out to it
  });
  test('writes a 48 kHz 16-bit stereo WAV', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhea-bed-'));
    try {
      const file = writeBed(path.join(dir, 'bed.wav'), 2);
      const b = fs.readFileSync(file);
      assert.equal(b.toString('latin1', 0, 4), 'RIFF');
      assert.equal(b.readUInt16LE(22), 2);
      assert.equal(b.readUInt32LE(24), 48000);
      assert.equal(b.readUInt16LE(34), 16);
      assert.equal(b.readUInt32LE(40), 2 * 48000 * 2 * 2);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  test('brand.json turns it on, at -28 dB', () => {
    assert.equal(brand.audioBed.enabled, true);
    assert.equal(brand.audioBed.levelDb, -28);
  });
});
