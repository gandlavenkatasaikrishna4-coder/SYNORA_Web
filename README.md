# SYNORA Web Prototype (Phase 1)

PROTOTYPE CODE. Tests the sync timing method in a browser. It does not prove Android or Bluetooth speaker behavior.
Created by Joe (Creator / Builder). Idea: Sai Krishna (Idea Contributor).

## Files
- `SYNORA.html` - the page (host and receiver in one)
- `synora-core.js` - clock sync, session timeline, packet ordering (pure logic)
- `core.test.js` - tests. Run: `node core.test.js`

## Run on GitHub Pages (free)
1. Put the three files in a GitHub repo (root folder).
2. Settings > Pages > Deploy from branch > `main` / root.
3. Open the Pages link followed by `/SYNORA.html` on every phone (HTTPS is required; the name is case-sensitive).

## Try it
1. Phone A: tap **Host a room**. Note the 4-letter code.
2. Other phones: open the link (or enter the code) and tap **Join room**.
3. Host taps **Play**. A click plays every second, in sync if all is well.

## Measure sync (repeatable)
1. Put all phones close together, volume equal, same Wi-Fi.
2. Record all of them with one microphone (laptop or a separate phone).
3. Play for 10 minutes. Compare click positions in the recording (for example in Audacity) at the start and at the end.
4. Write down: spread between phones at start, at end, and the "Drift since start" readout. Repeat 3 times.

## Known limits
- Relay uses PeerJS public cloud (free, no uptime guarantee). Only small commands travel over the internet, never audio.
- Browser audio delay differs per device and is not corrected yet.
- Drift is displayed, not corrected, in this version.
- Health thresholds are guesses.
