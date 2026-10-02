// Run with: node core.test.js
const assert = require('assert');
const C = require('./synora-core.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' vs ' + b);

test('clockSample: symmetric delay gives exact offset', () => {
  // receiver clock is 500 ms behind host; one-way delay 20 ms each way
  const s = C.clockSample(1000, 1520, 1521, 1041);
  near(s.offset, 500); near(s.rtt, 40);
});
test('clockSample: zero offset', () => {
  const s = C.clockSample(0, 10, 10, 20);
  near(s.offset, 0); near(s.rtt, 20);
});
test('pickOffset: prefers low-RTT samples', () => {
  const r = C.pickOffset([
    { offset: 500, rtt: 20 }, { offset: 501, rtt: 22 }, { offset: 499, rtt: 25 },
    { offset: 560, rtt: 300 }, { offset: 430, rtt: 400 }
  ], 3);
  near(r.offset, 500); near(r.rtt, 20); near(r.spread, 2); assert.strictEqual(r.used, 3);
});
test('pickOffset: empty and invalid input', () => {
  assert.strictEqual(C.pickOffset([]), null);
  assert.strictEqual(C.pickOffset([{ offset: NaN, rtt: 5 }, { offset: 1, rtt: -1 }]), null);
});
test('hostToLocal / localToHost round trip', () => {
  near(C.localToHost(C.hostToLocal(12345, 250), 250), 12345);
});
test('positionAt: playing, paused, idle, clamp', () => {
  const play = C.reduce(C.initialState(), { type: 'play', startHost: 1000, pos: 10 }, 120);
  near(C.positionAt(play, 1000, 120), 10);
  near(C.positionAt(play, 3500, 120), 12.5);
  near(C.positionAt(play, 500, 120), 10);          // before start: hold start pos
  near(C.positionAt(play, 1e9, 120), 120);          // clamped to duration
  assert.strictEqual(C.positionAt(C.initialState(), 5000, 120), 0);
});
test('reduce: pause freezes position, then resume', () => {
  let s = C.reduce(C.initialState(), { type: 'play', startHost: 0, pos: 0 }, 120);
  s = C.reduce(s, { type: 'pause', atHost: 4000 }, 120);
  assert.strictEqual(s.status, 'paused'); near(s.pos, 4);
  s = C.reduce(s, { type: 'play', startHost: 9000, pos: s.pos }, 120);
  near(C.positionAt(s, 11000, 120), 6);
});
test('reduce: pause when not playing is a no-op', () => {
  const s = C.initialState();
  assert.strictEqual(C.reduce(s, { type: 'pause', atHost: 1 }, 120), s);
});
test('reduce: seek while playing and while paused', () => {
  let s = C.reduce(C.initialState(), { type: 'play', startHost: 0, pos: 0 }, 120);
  s = C.reduce(s, { type: 'seek', pos: 60, startHost: 5000 }, 120);
  assert.strictEqual(s.status, 'playing'); near(C.positionAt(s, 7000, 120), 62);
  s = C.reduce(s, { type: 'pause', atHost: 7000 }, 120);
  s = C.reduce(s, { type: 'seek', pos: 30, startHost: 0 }, 120);
  assert.strictEqual(s.status, 'paused'); near(s.pos, 30);
});
test('reduce: seek is clamped to track', () => {
  const s = C.reduce(C.initialState(), { type: 'seek', pos: -5 }, 120);
  near(s.pos, 0);
  near(C.reduce(s, { type: 'seek', pos: 999 }, 120).pos, 120);
});
test('reduce: stop resets', () => {
  const s = C.reduce(C.reduce(C.initialState(), { type: 'play', startHost: 0, pos: 5 }, 120), { type: 'stop' }, 120);
  assert.deepStrictEqual(s, C.initialState());
});
test('acceptCommand: ordering and duplicates', () => {
  let r = C.acceptCommand(0, 1); assert.ok(r.accept); assert.strictEqual(r.lastSeq, 1);
  r = C.acceptCommand(5, 5); assert.ok(!r.accept);
  r = C.acceptCommand(5, 3); assert.ok(!r.accept); assert.strictEqual(r.lastSeq, 5);
  r = C.acceptCommand(5, 9); assert.ok(r.accept);   // gaps are allowed
  assert.ok(!C.acceptCommand(0, undefined).accept);
});
test('planStart: on time', () => {
  // host start at 10000, receiver is 500 ms behind host, local now 9400 -> wait 100
  const p = C.planStart({ startHost: 10000, pos: 0 }, 500, 9400);
  near(p.waitMs, 100); assert.ok(!p.late); near(p.pos, 0);
});
test('planStart: late start skips ahead', () => {
  const p = C.planStart({ startHost: 10000, pos: 20 }, 500, 9700); // 200 ms late
  near(p.waitMs, 0); assert.ok(p.late); near(p.lateMs, 200); near(p.pos, 20.2);
});
test('syncHealth thresholds', () => {
  assert.strictEqual(C.syncHealth(2, 50), 'good');
  assert.strictEqual(C.syncHealth(10, 200), 'fair');
  assert.strictEqual(C.syncHealth(30, 50), 'poor');
  assert.strictEqual(C.syncHealth(null, null), 'unknown');
});
test('makeRoomCode: length and alphabet', () => {
  let i = 0; const seq = [0, 0.5, 0.99, 0.25];
  const code = C.makeRoomCode(() => seq[i++ % seq.length], 4);
  assert.strictEqual(code.length, 4); assert.ok(/^[A-HJ-NP-Z2-9]+$/.test(code));
});
test('clickTrack: click each second, silence between', () => {
  const sr = 8000, t = C.clickTrack(sr, 3);
  assert.strictEqual(t.length, 3 * sr);
  const maxAbs = (a, b) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(t[i])); return m; };
  for (let s = 0; s < 3; s++) {
    assert.ok(maxAbs(s * sr, s * sr + 160) > 0.1, 'click at second ' + s);
    assert.strictEqual(maxAbs(s * sr + 400, (s + 1) * sr - 1), 0);
  }
});
test('reduce: track id follows play, pause, seek', () => {
  let s = C.reduce(C.initialState(), { type: 'play', startHost: 0, pos: 0, track: 's1' }, 100);
  assert.strictEqual(s.track, 's1');
  s = C.reduce(s, { type: 'pause', atHost: 1000 }, 100); assert.strictEqual(s.track, 's1');
  s = C.reduce(s, { type: 'seek', pos: 5 }, 100); assert.strictEqual(s.track, 's1');
  s = C.reduce(s, { type: 'play', startHost: 0, pos: 5 }, 100); assert.strictEqual(s.track, 's1');
});
test('moveItem: up, down, edges', () => {
  assert.deepStrictEqual(C.moveItem(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
  assert.deepStrictEqual(C.moveItem(['a', 'b', 'c'], 1, 1), ['a', 'c', 'b']);
  assert.deepStrictEqual(C.moveItem(['a', 'b'], 0, -1), ['a', 'b']);
  assert.deepStrictEqual(C.moveItem(['a', 'b'], 1, 1), ['a', 'b']);
});
const Q = o => Object.assign({ n: 3, idx: 0, trackPlays: 1, trackReps: 1, listPlays: 1, listReps: 1, shuffle: false }, o);
test('advance: plain order then finish', () => {
  let q = C.advance(Q(), Math.random); assert.strictEqual(q.idx, 1);
  q = C.advance(q, Math.random); assert.strictEqual(q.idx, 2);
  assert.strictEqual(C.advance(q, Math.random), null);
});
test('advance: each song x2', () => {
  let q = Q({ trackReps: 2 });
  q = C.advance(q, Math.random); assert.strictEqual(q.idx, 0); assert.strictEqual(q.trackPlays, 2);
  q = C.advance(q, Math.random); assert.strictEqual(q.idx, 1); assert.strictEqual(q.trackPlays, 1);
});
test('advance: whole list x2', () => {
  let q = Q({ idx: 2, listReps: 2 });
  q = C.advance(q, Math.random); assert.strictEqual(q.idx, 0); assert.strictEqual(q.listPlays, 2);
  assert.strictEqual(C.advance(Q({ idx: 2, listPlays: 2, listReps: 2 }), Math.random), null);
});
test('advance: shuffle never repeats current song', () => {
  for (let i = 0; i < 20; i++) assert.notStrictEqual(C.advance(Q({ idx: 1, shuffle: true }), Math.random).idx, 1);
  assert.strictEqual(C.advance(Q({ idx: 1, shuffle: true }), () => 0).idx, 0);
  assert.strictEqual(C.advance(Q({ idx: 1, shuffle: true }), () => 0.99).idx, 2);
});
test('skip: wraps both ways', () => {
  assert.strictEqual(C.skip(Q({ idx: 2 }), 1).idx, 0);
  assert.strictEqual(C.skip(Q({ idx: 0 }), -1).idx, 2);
  assert.strictEqual(C.skip(Q({ n: 0 }), 1).idx, 0);
});
test('strengthLabel: bands and loss', () => {
  assert.strictEqual(C.strengthLabel(30, false), 'Excellent');
  assert.strictEqual(C.strengthLabel(100, false), 'Good');
  assert.strictEqual(C.strengthLabel(700, false), 'Poor');
  assert.strictEqual(C.strengthLabel(null, false), 'Measuring');
  assert.strictEqual(C.strengthLabel(30, true), 'Network loss');
});
test('median', () => { near(C.median([3, 1, 2]), 2); near(C.median([1, 2, 3, 4]), 2.5); });
test('predictOffset: tracks a 200 ppm clock drift', () => {
  const smp = []; for (let t = 0; t <= 30000; t += 1000) smp.push({ offset: 500 + 0.0002 * t, rtt: 20 + (t / 1000 % 3) * 5, t: t });
  const r = C.predictOffset(smp, 30000, 3);
  near(r.offset, 506, 0.01); near(r.slopePpm, 200, 0.5);
});
test('predictOffset: too little data falls back', () => {
  const smp = [{ offset: 500, rtt: 20, t: 0 }, { offset: 502, rtt: 22, t: 400 }, { offset: 498, rtt: 25, t: 800 }];
  const r = C.predictOffset(smp, 1000, 3);
  assert.strictEqual(r.slopePpm, null); near(r.offset, 500);
  assert.strictEqual(C.predictOffset([], 0, 3), null);
});
test('predictOffset: ignores an absurd fit', () => {
  const smp = []; for (let t = 0; t <= 30000; t += 1000) smp.push({ offset: 500 + 0.01 * t, rtt: 20, t: t });
  assert.strictEqual(C.predictOffset(smp, 30000, 3).slopePpm, null);
});
console.log('\n' + passed + ' tests passed');
