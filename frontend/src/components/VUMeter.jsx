import { useEffect, useRef, useState } from "react";

// Classic analog VU meter: cream dial, arc scale with a red zone, and a swinging needle
// with VU-style ballistics (fast attack, slow release). `level` (or max of left/right) is 0..1.
export default function VUMeter({ left = 0, right = 0, level = null, label = "VU", className = "" }) {
  const target = level != null ? level : Math.max(left || 0, right || 0);
  const targetRef = useRef(0);
  targetRef.current = Math.min(1, Math.max(0, target));
  const dispRef = useRef(0);
  const [disp, setDisp] = useState(0);

  useEffect(() => {
    let raf;
    const tick = () => {
      const t = targetRef.current;
      const cur = dispRef.current;
      const k = t > cur ? 0.3 : 0.08; // attack faster than release, like a real VU
      const next = cur + (t - cur) * k;
      dispRef.current = next;
      setDisp(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cx = 60, cy = 70, R = 54;
  const A = 52; // half sweep in degrees (-A .. +A)
  const pt = (a, r = R) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  // arc path helper
  const arc = (a0, a1, r = R) => {
    const [x0, y0] = pt(a0, r); const [x1, y1] = pt(a1, r);
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const ang = -A + Math.min(1, Math.max(0, disp)) * 2 * A;
  const redStart = 18; // degrees where the red (over) zone begins
  const ticks = [-52, -40, -28, -15, 0, 18, 34, 52];
  const peaking = ang >= redStart;

  return (
    <svg viewBox="0 0 120 84" className={className} data-testid="vu-meter" style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="vuface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbf4df" />
          <stop offset="55%" stopColor="#f0e4c2" />
          <stop offset="100%" stopColor="#e4d2a3" />
        </linearGradient>
        <radialGradient id="vuglass" cx="50%" cy="20%" r="90%">
          <stop offset="0%" stopColor="rgba(255,255,255,.55)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* dial face */}
      <rect x="2" y="2" width="116" height="80" rx="10" fill="url(#vuface)" stroke="#8a6d2f" strokeWidth="1.2" />
      <rect x="2" y="2" width="116" height="80" rx="10" fill="url(#vuglass)" />

      {/* baseline arc */}
      <path d={arc(-A, A)} fill="none" stroke="#2a2a2a" strokeWidth="1.3" />
      {/* red (over) zone */}
      <path d={arc(redStart, A)} fill="none" stroke="#d11f2a" strokeWidth="3" strokeLinecap="round" />

      {/* ticks */}
      {ticks.map((a, i) => {
        const [x0, y0] = pt(a, R - 1);
        const [x1, y1] = pt(a, R - (a >= redStart ? 8 : 6));
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={a >= redStart ? "#d11f2a" : "#2a2a2a"} strokeWidth={a === 0 ? 1.6 : 1} />;
      })}

      {/* scale labels */}
      <text x={pt(-A, R - 14)[0]} y={pt(-A, R - 14)[1]} fontSize="7" fill="#5b4a22" textAnchor="middle" fontWeight="700">-20</text>
      <text x={pt(0, R - 14)[0]} y={pt(0, R - 14)[1] + 2} fontSize="8" fill="#2a2a2a" textAnchor="middle" fontWeight="800">0</text>
      <text x={pt(A, R - 14)[0]} y={pt(A, R - 14)[1]} fontSize="7" fill="#b01722" textAnchor="middle" fontWeight="800">+3</text>

      {/* VU badge */}
      <text x={cx} y={cy - 8} fontSize="9" fill="#3a2f12" textAnchor="middle" fontWeight="800" letterSpacing="1.5">VU</text>
      {label && label !== "VU" && <text x={cx} y="80" fontSize="6.5" fill="#6b5a2c" textAnchor="middle" fontWeight="700">{label}</text>}

      {/* needle */}
      <g transform={`rotate(${ang.toFixed(2)} ${cx} ${cy})`}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - (R - 4)} stroke={peaking ? "#d11f2a" : "#111"} strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r="4.5" fill="#222" stroke="#000" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="1.6" fill="#777" />
    </svg>
  );
}
