import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { elBoxStyle, ElementContent, animStyle, entranceStyle, flowEntranceStyle, BackgroundLayer } from "@/lib/elementRender";
import PancarteView from "@/components/PancarteView";

function FlowRegion({ placement, flowData, editable, selected, onPointerDownRegion }) {
  const flow = flowData?.flow || null;
  const pancartes = flowData?.pancartes || [];
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [placement.flow_id, pancartes.length]);
  useEffect(() => {
    if (pancartes.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % pancartes.length), Math.max(1, flow?.interval || 5) * 1000);
    return () => clearInterval(t);
  }, [pancartes.length, flow?.interval]);
  const pan = pancartes.length ? pancartes[idx % pancartes.length] : null;
  return (
    <div data-testid={`canvas-flow-${placement.id}`}
      onPointerDown={editable ? (e) => onPointerDownRegion(e, placement, "move") : undefined}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: placement.x, top: placement.y, width: placement.w, height: placement.h, overflow: "hidden",
        cursor: editable ? "move" : "default", outline: selected ? "2px dashed #5f6da6" : "none", outlineOffset: 3,
        background: pan ? "transparent" : "rgba(148,163,184,.12)" }}>
      {pan ? (
        <div key={`${idx}:${flow?.entrance}`} style={{ position: "absolute", inset: 0, ...flowEntranceStyle(flow) }}>
          <PancarteView pancarte={pan} />
        </div>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8",
          border: "2px dashed rgba(148,163,184,.5)", borderRadius: 12, fontSize: 14, textAlign: "center", padding: 8 }}>
          {flow ? "Flow has no pancartes yet" : "Pick a flow in the panel →"}
        </div>
      )}
      {selected && editable && (
        <div onPointerDown={(e) => onPointerDownRegion(e, placement, "resize")}
          style={{ position: "absolute", right: -6, bottom: -6, width: 16, height: 16, background: "#5f6da6", borderRadius: 4, cursor: "nwse-resize", border: "2px solid #fff" }} />
      )}
    </div>
  );
}

export default function SceneCanvas({ scene, editable = false, selectedId, onSelect, onUpdate, sourceValues, selectedFlowId, onSelectFlow, onUpdateFlow, flowsData = {} }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  const [, force] = useState(0);
  const drag = useRef(null);

  useLayoutEffect(() => {
    const measure = () => { if (wrapRef.current) setScale(wrapRef.current.clientWidth / scene.width); };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [scene.width]);

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
        <BackgroundLayer background={scene.background} />
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
              style={{ ...elBoxStyle(el), cursor: editable ? "move" : "default", outline: selected ? "2px solid #5f6da6" : "none", outlineOffset: 2 }}>
              <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "inherit", alignItems: "inherit", ...entranceStyle(el) }}>
                <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "inherit", alignItems: "inherit", ...animStyle(el) }}>
                  <ElementContent el={el} sourceValues={sourceValues} />
                </div>
              </div>
              {selected && (
                <div onPointerDown={(e) => onPointerDown(e, el, "resize")}
                  style={{ position: "absolute", right: -6, bottom: -6, width: 16, height: 16, background: "#5f6da6", borderRadius: 4, cursor: "nwse-resize", border: "2px solid #fff" }} />
              )}
            </div>
          );
        })}
        {(scene.flows || []).map((pl) => (
          <FlowRegion key={pl.id} placement={pl} flowData={flowsData[pl.flow_id]} editable={editable}
            selected={editable && pl.id === selectedFlowId}
            onPointerDownRegion={(e, item, mode) => onPointerDown(e, item, mode, "flow")} />
        ))}
      </div>
    </div>
  );
}
