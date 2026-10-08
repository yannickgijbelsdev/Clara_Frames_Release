// Modern stereo VU meter in the Clara Frames style.
// `left` and `right` are instantaneous levels in 0..1.
function Bar({ v }) {
  const pct = Math.max(2, Math.min(100, Math.round(v * 100)));
  return (
    <div className="relative w-2.5 h-full rounded-full bg-slate-800/80 ring-1 ring-white/5 overflow-hidden">
      <div
        className="absolute bottom-0 left-0 right-0 rounded-full"
        style={{
          height: `${pct}%`,
          transition: "height 70ms linear",
          background: "linear-gradient(to top,#22d3ee 0%,#5f6da6 45%,#f59e0b 78%,#f43f5e 96%)",
          boxShadow: "0 0 10px rgba(95,109,166,.45)",
        }}
      />
      {/* segment lines for the classic LED look */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "repeating-linear-gradient(to top,transparent 0 6px,rgba(2,6,23,.55) 6px 7px)" }} />
    </div>
  );
}

export default function VUMeter({ left = 0, right = 0, className = "" }) {
  return (
    <div className={`flex items-end gap-1.5 h-full ${className}`} data-testid="vu-meter">
      <div className="flex flex-col justify-between items-center h-full pr-0.5 text-[8px] font-bold text-slate-500 leading-none select-none">
        <span>0</span><span>-12</span><span>-∞</span>
      </div>
      <Bar v={left} />
      <Bar v={right} />
      <div className="flex flex-col justify-end gap-[3px] pl-0.5 text-[8px] font-bold text-slate-500 leading-none select-none">
        <span>L</span><span className="mt-auto">R</span>
      </div>
    </div>
  );
}
