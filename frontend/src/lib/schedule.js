// Shared scheduling helpers — mirrors the overlay generator logic in server.py.

export function nextStartMs(flow, fromMs = Date.now()) {
  const from = new Date(fromMs);
  if (flow?.scheduleMode === "times" && flow.scheduleTimes?.length) {
    let best = null;
    for (let dday = 0; dday < 2; dday++) {
      for (const tstr of flow.scheduleTimes) {
        const [h, m] = String(tstr).split(":");
        const hh = parseInt(h, 10) || 0, mm = parseInt(m, 10) || 0;
        const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + dday, hh, mm, 0, 0);
        if (d.getTime() > fromMs + 500 && (best === null || d.getTime() < best)) best = d.getTime();
      }
      if (best !== null) break;
    }
    return best !== null ? best : fromMs + 60000;
  }
  const n = Math.max(1, flow?.scheduleEveryMin ?? 15);
  const midnight = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0).getTime();
  const minsSince = (fromMs - midnight) / 60000;
  const nextSlot = (Math.floor(minsSince / n) + 1) * n;
  return midnight + nextSlot * 60000;
}

// Returns the next `count` scheduled start times (ms epoch) for a scheduled flow.
export function nextStarts(flow, count = 6, fromMs = Date.now()) {
  const out = [];
  let cursor = fromMs;
  for (let i = 0; i < count; i++) {
    const t = nextStartMs(flow, cursor);
    out.push(t);
    cursor = t + 1000;
  }
  return out;
}

export function fmtCountdown(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (x) => (x < 10 ? "0" : "") + x;
  return (h > 0 ? p(h) + ":" : "") + p(m) + ":" + p(ss);
}

export function fmtClock(ms) {
  const d = new Date(ms);
  const p = (x) => (x < 10 ? "0" : "") + x;
  return p(d.getHours()) + ":" + p(d.getMinutes());
}

// Rough estimate of one play-through duration (seconds) for a sequence.
export function sequenceDuration(flow) {
  if (!flow) return 0;
  const ids = flow.pancarte_ids || [];
  const durs = flow.durations || [];
  let total = 0;
  ids.forEach((_, i) => { total += (durs[i] ?? flow.interval ?? 5); });
  if (flow.intro?.url) total += flow.intro.seconds ?? 3;
  if (flow.outro?.url) total += flow.outro.seconds ?? 3;
  if (flow.transition?.url && ids.length > 1) total += (flow.transition.seconds ?? 1) * (ids.length - 1);
  return Math.round(total);
}
