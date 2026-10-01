/* SYNORA web prototype - core logic (PROTOTYPE CODE, Phase 1).
   Pure functions only: no browser APIs, so it can be tested with Node.
   Created by Joe | Idea contributed by Sai Krishna */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SynoraCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Clock sync (NTP-style) -------------------------------------------
  // t0 = receiver send time, t1 = host receive time, t2 = host send time,
  // t3 = receiver receive time. offset = hostClock - receiverClock (ms).
  function clockSample(t0, t1, t2, t3) {
    return { offset: ((t1 - t0) + (t2 - t3)) / 2, rtt: (t3 - t0) - (t2 - t1) };
  }

  function median(values) {
    const s = values.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Samples with the smallest round-trip are the most trustworthy.
  function pickOffset(samples, keep) {
    keep = keep || 3;
    const ok = samples.filter(s => isFinite(s.offset) && isFinite(s.rtt) && s.rtt >= 0);
    if (!ok.length) return null;
    const best = ok.slice().sort((a, b) => a.rtt - b.rtt).slice(0, keep);
    const offs = best.map(s => s.offset);
    return {
      offset: median(offs),
      rtt: best[0].rtt,
      spread: Math.max.apply(null, offs) - Math.min.apply(null, offs),
      used: best.length
    };
  }

  function hostToLocal(hostMs, offset) { return hostMs - offset; }
  function localToHost(localMs, offset) { return localMs + offset; }

  // ---- Session timeline -------------------------------------------------
  function initialState() {
    return { status: 'idle', startHost: 0, startPos: 0, pos: 0 };
  }

  // Track position (seconds) at a given host-clock time (ms).
  function positionAt(state, hostNow, duration) {
    if (state.status === 'playing') {
      const p = state.startPos + Math.max(0, hostNow - state.startHost) / 1000;
      return duration == null ? p : Math.min(p, duration);
    }
    if (state.status === 'paused') return state.pos;
    return 0;
  }

  function reduce(state, cmd, duration) {
    const clamp = p => Math.min(Math.max(p, 0), duration == null ? Infinity : duration);
    switch (cmd.type) {
      case 'play': {
        const p = clamp(cmd.pos == null ? state.pos : cmd.pos);
        return { status: 'playing', startHost: cmd.startHost, startPos: p, pos: p };
      }
      case 'pause': {
        if (state.status !== 'playing') return state;
        return { status: 'paused', startHost: 0, startPos: 0, pos: positionAt(state, cmd.atHost, duration) };
      }
      case 'stop':
        return initialState();
      case 'seek': {
        const p = clamp(cmd.pos);
        if (state.status === 'playing') return { status: 'playing', startHost: cmd.startHost, startPos: p, pos: p };
        return { status: 'paused', startHost: 0, startPos: 0, pos: p };
      }
      default:
        return state;
    }
  }

  // ---- Packet ordering --------------------------------------------------
  // Commands carry a sequence number. Old or repeated ones are ignored.
  function acceptCommand(lastSeq, seq) {
    if (!Number.isInteger(seq) || seq <= lastSeq) return { accept: false, lastSeq: lastSeq };
    return { accept: true, lastSeq: seq };
  }

  // ---- Scheduling -------------------------------------------------------
  // How long to wait (local ms) before starting; if we are already late,
  // start now and skip ahead in the track by the lateness.
  function planStart(cmd, offset, nowLocal) {
    const wait = hostToLocal(cmd.startHost, offset) - nowLocal;
    if (wait >= 0) return { waitMs: wait, pos: cmd.pos, late: false, lateMs: 0 };
    return { waitMs: 0, pos: cmd.pos + (-wait) / 1000, late: true, lateMs: -wait };
  }

  // Thresholds are PROTOTYPE GUESSES, not verified targets.
  function syncHealth(spreadMs, rttMs) {
    if (spreadMs == null || rttMs == null) return 'unknown';
    if (spreadMs <= 5 && rttMs <= 150) return 'good';
    if (spreadMs <= 15 && rttMs <= 400) return 'fair';
    return 'poor';
  }

  // ---- Helpers ----------------------------------------------------------
  function makeRoomCode(rand, len) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
    let out = '';
    for (let i = 0; i < (len || 4); i++) out += alphabet[Math.floor(rand() * alphabet.length)];
    return out;
  }

  // Test signal: a short click every second (higher pitch every 4th second).
  function clickTrack(sampleRate, seconds) {
    const out = new Float32Array(Math.round(sampleRate * seconds));
    const len = Math.round(0.02 * sampleRate);
    for (let s = 0; s < seconds; s++) {
      const base = Math.round(s * sampleRate);
      const f = s % 4 === 0 ? 1500 : 1000;
      for (let i = 0; i < len && base + i < out.length; i++) {
        out[base + i] = 0.8 * Math.sin(2 * Math.PI * f * (i + 1) / sampleRate) * Math.exp(-6 * i / len);
      }
    }
    return out;
  }

  return {
    clockSample, pickOffset, hostToLocal, localToHost,
    initialState, positionAt, reduce, acceptCommand, planStart,
    syncHealth, makeRoomCode, clickTrack
  };
});
