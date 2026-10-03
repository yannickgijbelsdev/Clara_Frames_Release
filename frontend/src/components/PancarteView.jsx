import { useRef, useState, useLayoutEffect, useEffect } from "react";
import { elBoxStyle, ElementContent, animStyle, entranceStyle, BackgroundLayer } from "@/lib/elementRender";

// Renders a pancarte design (background + freely-placed elements) scaled to fit its
// container (contain), centered. Used for canvas flow regions, thumbnails and previews.
export default function PancarteView({ pancarte, sourceValues, animate = false }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const m = () => { if (ref.current) setBox({ w: ref.current.clientWidth, h: ref.current.clientHeight }); };
    m();
    const ro = new ResizeObserver(m);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const pw = pancarte.width || 1920, ph = pancarte.height || 1080;
  const scale = box.w && box.h ? Math.min(box.w / pw, box.h / ph) : 0;
  const sw = pw * scale, sh = ph * scale;
  const bg = pancarte.background || {};

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: (box.w - sw) / 2, top: (box.h - sh) / 2,
        width: pw, height: ph, transformOrigin: "top left", transform: `scale(${scale})`,
        overflow: "hidden", background: bg.color || "#0b1020",
      }}>
        <BackgroundLayer background={bg} />
        {bg.overlayColor && (bg.overlayOpacity ?? 0) > 0 && (
          <div style={{ position: "absolute", inset: 0, background: bg.overlayColor, opacity: bg.overlayOpacity, pointerEvents: "none" }} />
        )}
        {(pancarte.elements || []).filter((el) => !el.hidden).map((el) => (
          <div key={el.id} style={elBoxStyle(el)}>
            <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "inherit", alignItems: "inherit", ...(animate ? entranceStyle(el) : {}) }}>
              <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "inherit", alignItems: "inherit", ...(animate ? animStyle(el) : {}) }}>
                <ElementContent el={el} sourceValues={sourceValues} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
