import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { formatClock } from "@/lib/clock";

const ANIM_MAP = { pulse: "clara-pulse", fade: "clara-fade", spin: "clara-spin", bounce: "clara-bounce", float: "clara-float", blink: "clara-blink", slide: "clara-slide" };
function animStyle(el) {
  const a = el.props?.animation;
  if (!a || a === "none" || !ANIM_MAP[a]) return {};
  const dur = el.props?.animationDuration || 2;
  const timing = a === "spin" ? "linear" : "ease-in-out";
  const dir = a === "slide" ? " alternate" : "";
  return { animation: `${ANIM_MAP[a]} ${dur}s ${timing} infinite${dir}` };
}

const ENTRANCE_MAP = { fade: "clara-in-fade", "slide-up": "clara-in-up", "slide-down": "clara-in-down", "slide-left": "clara-in-left", "slide-right": "clara-in-right", zoom: "clara-in-zoom" };
function entranceStyle(el) {
  const e = el.props?.entrance;
  if (!e || e === "none" || !ENTRANCE_MAP[e]) return {};
  const dur = el.props?.entranceDuration || 0.6;
  const delay = el.props?.entranceDelay || 0;
  return { animation: `${ENTRANCE_MAP[e]} ${dur}s ease-out ${delay}s both` };
}

function flowEntranceStyle(fl) {
  const e = fl.entrance;
  if (!e || e === "none" || !ENTRANCE_MAP[e]) return {};
  const dur = fl.entranceDuration || 0.6;
  return { animation: `${ENTRANCE_MAP[e]} ${dur}s ease-out both` };
}

function PancarteCard({ card, style }) {
  const s = style || {};
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 20, boxSizing: "border-box",
      background: s.backgroundColor || "#0b1020", color: s.color || "#ffffff",
      borderRadius: s.borderRadius != null ? s.borderRadius : 16, padding: s.padding != null ? s.padding : 20,
      fontFamily: s.fontFamily || "'Outfit', sans-serif", overflow: "hidden" }}>
      {card?.image && <img src={card.image} alt="" style={{ height: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 12 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: s.titleSize || 44, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card?.title || "Title"}</div>
        <div style={{ fontSize: s.subtitleSize || 26, opacity: 0.8, marginTop: 6 }}>{card?.subtitle || ""}</div>
      </div>
    </div>
  );
}

function FlowRegion({ flow, editable, selected, onPointerDownRegion }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const cards = flow.cards || [];
    if (cards.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % cards.length), Math.max(1, flow.interval || 5) * 1000);
    return () => clearInterval(t);
  }, [flow.cards?.length, flow.interval]);
  const cards = flow.cards || [];
  const card = cards.length ? cards[idx % cards.length] : null;
  return (
    <div data-testid={`canvas-flow-${flow.id}`}
      onPointerDown={editable ? (e) => onPointerDownRegion(e, flow, "move") : undefined}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: flow.x, top: flow.y, width: flow.w, height: flow.h, overflow: "visible",
        cursor: editable ? "move" : "default", outline: selected ? "2px dashed #5f6da6" : "none", outlineOffset: 3 }}>
      <div key={`${idx}:${flow.entrance}`} style={{ width: "100%", height: "100%", ...flowEntranceStyle(flow) }}>
        {card ? <PancarteCard card={card} style={flow.style} /> : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", border: "2px dashed rgba(148,163,184,.5)", borderRadius: 12, fontSize: 14 }}>Empty flow — add cards</div>
        )}
      </div>
      {selected && (
        <div onPointerDown={(e) => onPointerDownRegion(e, flow, "resize")}
          style={{ position: "absolute", right: -6, bottom: -6, width: 16, height: 16, background: "#5f6da6", borderRadius: 4, cursor: "nwse-resize", border: "2px solid #fff" }} />
      )}
    </div>
  );
}

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

export default function SceneCanvas({ scene, editable = false, selectedId, onSelect, onUpdate, sourceValues, selectedFlowId, onSelectFlow, onUpdateFlow }) {
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

  const onPointerDown = useCallback((e, item, mode, kind = "el") => {
    if (!editable) return;
    e.stopPropagation();
    e.target.setPointerCapture?.(e.pointerId);
    drag.current = { id: item.id, mode, kind, startX: e.clientX, startY: e.clientY, ox: item.x, oy: item.y, ow: item.w, oh: item.h };
    if (kind === "flow") onSelectFlow?.(item.id); else onSelect?.(item.id);
  }, [editable, onSelect, onSelectFlow]);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    const upd = d.kind === "flow" ? onUpdateFlow : onUpdate;
    if (d.mode === "move") {
      upd?.(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) });
    } else {
      upd?.(d.id, { w: Math.max(20, Math.round(d.ow + dx)), h: Math.max(20, Math.round(d.oh + dy)) });
    }
  }, [scale, onUpdate, onUpdateFlow]);

  const onPointerUp = useCallback(() => { drag.current = null; }, []);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ aspectRatio: `${scene.width} / ${scene.height}` }}>
      <div
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onClick={(e) => { if (editable && e.target === e.currentTarget) { onSelect?.(null); onSelectFlow?.(null); } }}
        style={{
          position: "absolute", top: 0, left: 0,
          width: scene.width, height: scene.height,
          transform: `scale(${scale})`, transformOrigin: "top left",
          background: scene.background?.color || "#0b1020",
          overflow: "hidden",
        }}
      >
        {scene.background?.src && (() => {
          const bg = scene.background;
          const fit = bg.fit || "cover";
          if (bg.type === "video") {
            return <video key={bg.src} src={bg.src} autoPlay loop muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit === "contain" ? "contain" : "cover" }} />;
          }
          if (fit === "repeat") {
            return <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bg.src})`, backgroundRepeat: "repeat" }} />;
          }
          return <img src={bg.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit === "contain" ? "contain" : "cover" }} />;
        })()}
        {scene.background?.overlayColor && (scene.background?.overlayOpacity ?? 0) > 0 && (
          <div style={{ position: "absolute", inset: 0, background: scene.background.overlayColor, opacity: scene.background.overlayOpacity, pointerEvents: "none" }} />
        )}
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
              <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "inherit", alignItems: "inherit", ...entranceStyle(el) }}>
                <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "inherit", alignItems: "inherit", ...animStyle(el) }}>
                  <ElementContent el={el} sourceValues={sourceValues} />
                </div>
              </div>
              {selected && (
                <div
                  onPointerDown={(e) => onPointerDown(e, el, "resize")}
                  style={{ position: "absolute", right: -6, bottom: -6, width: 16, height: 16, background: "#5f6da6", borderRadius: 4, cursor: "nwse-resize", border: "2px solid #fff" }} />
              )}
            </div>
          );
        })}
        {(scene.flows || []).map((fl) => (
          <FlowRegion key={fl.id} flow={fl} editable={editable}
            selected={editable && fl.id === selectedFlowId}
            onPointerDownRegion={(e, item, mode) => onPointerDown(e, item, mode, "flow")} />
        ))}
      </div>
    </div>
  );
}
