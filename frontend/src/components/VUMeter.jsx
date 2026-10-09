import { useEffect, useRef, useState } from "react";

// Simple vMix-style audio meter: two bare vertical bars (L/R) in Clara Frames blue
// that fill from the bottom, with a small red cap when the signal peaks.
// `left`/`right` are 0..1. VU-style ballistics: fast attack, slow release.
const BLUE = "#5f6da6"; // Clara Frames brand-600
const RED = "#e11d48";
const PEAK = 0.85; // fraction of the bar where the red zone begins

function useBallistics(target) {
  const targetRef = useRef(0);
  targetRef.current = Math.min(1, Math.max(0, target || 0));
  const dispRef = useRef(0);
  const [disp, setDisp] = useState(0);
  useEffect(() => {
    let raf;
    const tick = () => {
      const t = targetRef.current;
      const cur = dispRef.current;
      const k = t > cur ? 0.35 : 0.08; // attack faster than release
      const next = cur + (t - cur) * k;
      dispRef.current = next;
      setDisp(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return disp;
}

function Bar({ value }) {
  const fill = Math.min(1, Math.max(0, value)) * 100;
  const blueH = Math.min(fill, PEAK * 100);
  const redH = Math.max(0, fill - PEAK * 100);
  return (
    <div className="relative flex-1 h-full rounded-[2px] overflow-hidden bg-black/35">
      <div className="absolute bottom-0 left-0 right-0" style={{ height: `${blueH}%`, backgroundColor: BLUE }} />
      {redH > 0 && (
        <div className="absolute left-0 right-0" style={{ bottom: `${PEAK * 100}%`, height: `${redH}%`, backgroundColor: RED }} />
      )}
    </div>
  );
}

export default function VUMeter({ left = 0, right = 0, level = null, className = "" }) {
  const l = level != null ? level : left;
  const r = level != null ? level : right;
  const dispL = useBallistics(l);
  const dispR = useBallistics(r);
  return (
    <div data-testid="vu-meter" className={`flex gap-1 h-full w-full ${className}`}>
      <Bar value={dispL} />
      <Bar value={dispR} />
    </div>
  );
}
