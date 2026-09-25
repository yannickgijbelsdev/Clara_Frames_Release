import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { formatClock } from "@/lib/clock";

function elBoxStyle(el) {
  const st = el.style || {};
  const s = {
    position: "absolute",
    left: el.x, top: el.y, width: el.w, height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity != null ? el.opacity : 1,
    background: st.backgroundColor || undefined,
    borderRadius: st.borderRadius != null ? st.borderRadius : undefined,
    border: st.borderWidth ? `${st.borderWidth}px solid ${st.borderColor || "#fff"}` : undefined,
    padding: st.padding != null ? st.padding : undefined,
    color: st.color || "#ffffff",
    fontSize: st.fontSize || 40,
    fontFamily: st.fontFamily || "'Plus Jakarta Sans', sans-serif",
    fontWeight: st.fontWeight || 600,
    fontStyle: st.fontStyle || undefined,
    letterSpacing: st.letterSpacing || undefined,
    lineHeight: st.lineHeight || undefined,
    textShadow: st.textShadow || undefined,
    textAlign: st.textAlign || "left",
    display: "flex",
    justifyContent: st.textAlign === "center" ? "center" : st.textAlign === "right" ? "flex-end" : "flex-start",
    alignItems: st.verticalAlign === "top" ? "flex-start" : st.verticalAlign === "bottom" ? "flex-end" : "center",
    overflow: "hidden",
    boxSizing: "border-box",
  };
  return s;
}

function ElementContent({ el, tick, sourceValues }) {
  const p = el.props || {};
  if (el.type === "image") {
    return p.src ? <img src={p.src} alt="" style={{ width: "100%", height: "100%", objectFit: (el.style?.objectFit) || "contain" }} /> :
      <span style={{ fontSize: 16, opacity: .6 }}>image</span>;
  }
  if (el.type === "clock") return <span>{formatClock(p.timezone, p.format)}</span>;
  if (el.type === "api_field") {
    const key = `${p.sourceId}:${p.fieldKey}`;
    const v = sourceValues?.[key];
    return <span>{(p.prefix || "") + (v != null && v !== "" ? v : "…") + (p.suffix || "")}</span>;
  }
  if (el.type === "timed_text") {
    return (
      <div style={{ display: "flex", flexDirection: p.imagePosition === "top" ? "column" : "row", alignItems: "center", gap: 16, width: "100%", height: "100%" }}>
        {p.image && <img src={p.image} alt="" style={{ objectFit: "cover", height: p.imagePosition === "top" ? "60%" : "100%", borderRadius: 12 }} />}
        <div style={{ flex: 1 }}>{p.text || "Timed text"}</div>
      </div>
    );
  }
  return <span>{p.text || "Text"}</span>;
}

export default function SceneCanvas({ scene, editable = false, selectedId, onSelect, onUpdate, sourceValues }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  const [, force] = useState(0);
  const drag = useRef(null);

  useLayoutEffect(() => {
    const measure = () => {
      if (wrapRef.current) setScale(wrapRef.current.clientWidth / scene.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [scene.width]);

  // 1s tick for clock rendering
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const onPointerDown = useCallback((e, el, mode) => {
    if (!editable) return;
    e.stopPropagation();
    e.target.setPointerCapture?.(e.pointerId);
    drag.current = { id: el.id, mode, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
    onSelect?.(el.id);
  }, [editable, onSelect]);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (d.mode === "move") {
      onUpdate?.(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) });
    } else {
      onUpdate?.(d.id, { w: Math.max(20, Math.round(d.ow + dx)), h: Math.max(20, Math.round(d.oh + dy)) });
    }
  }, [scale, onUpdate]);

  const onPointerUp = useCallback(() => { drag.current = null; }, []);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ aspectRatio: `${scene.width} / ${scene.height}` }}>
      <div
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onClick={(e) => { if (editable && e.target === e.currentTarget) onSelect?.(null); }}
        style={{
          position: "absolute", top: 0, left: 0,
          width: scene.width, height: scene.height,
          transform: `scale(${scale})`, transformOrigin: "top left",
          background: scene.background?.color || "#0b1020",
          overflow: "hidden",
        }}
      >
        {scene.background?.src && (scene.background?.type === "video"
          ? <video key={scene.background.src} src={scene.background.src} autoPlay loop muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <img src={scene.background.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />)}
        {(scene.elements || []).map((el) => {
          const selected = editable && el.id === selectedId;
          return (
            <div key={el.id}
              data-testid={`canvas-el-${el.id}`}
              onPointerDown={(e) => onPointerDown(e, el, "move")}
              onClick={(e) => e.stopPropagation()}
              style={{
                ...elBoxStyle(el),
                cursor: editable ? "move" : "default",
                outline: selected ? "2px solid #5f6da6" : "none",
                outlineOffset: 2,
              }}>
              <ElementContent el={el} sourceValues={sourceValues} />
              {selected && (
                <div
                  onPointerDown={(e) => onPointerDown(e, el, "resize")}
                  style={{ position: "absolute", right: -6, bottom: -6, width: 16, height: 16, background: "#5f6da6", borderRadius: 4, cursor: "nwse-resize", border: "2px solid #fff" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
