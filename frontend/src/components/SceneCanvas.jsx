import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { elBoxStyle, ElementContent, animStyle, entranceStyle, flowEntranceStyle, BackgroundLayer } from "@/lib/elementRender";
import PancarteView from "@/components/PancarteView";

function OverlaySurface({ ov }) {
  if (!ov?.url) return null;
  const fit = ov.fit || "contain";
  const common = { width: "100%", height: "100%", border: 0, pointerEvents: "none" };
  if (ov.kind === "html") return <iframe title="overlay" src={ov.url} scrolling="no" style={{ ...common, background: "transparent" }} />;
  if (ov.kind === "video") return <video src={ov.url} autoPlay loop muted playsInline style={{ ...common, objectFit: fit }} />;
  return <img src={ov.url} alt="" style={{ ...common, objectFit: fit }} />;
}

const PREVIEW_GAP = 1.5; // compact pause between timed cycles in the editor preview

function FlowRegion({ placement, flowData, editable, selected, onPointerDownRegion, sourceValues }) {
  const flow = flowData?.flow || null;
  const sc = placement.schedule || {};
  const disabled = new Set(placement.disabledPancartes || []);
  const allPancartes = flowData?.pancartes || [];
  const pancartes = allPancartes.filter((p) => p && !disabled.has(p.id));
  const flowOff = placement.enabled === false;
  const timed = sc.mode === "everyX";
  const per = Math.max(1, flow?.interval || 5);
  const introSec = timed && sc.intro?.url ? Math.max(0, sc.intro.leadSeconds ?? 5) : 0;
  const outroSec = timed && sc.outro?.url ? Math.max(0, sc.outro.seconds ?? 5) : 0;
  const showDur = timed ? Math.max(1, sc.showSeconds ?? 20) : 0;

  const cycleLen = timed ? showDur + PREVIEW_GAP : (pancartes.length * per);

  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (cycleLen <= 0) return;
    const t = setInterval(() => setClock((c) => c + 0.25), 250);
    return () => clearInterval(t);
  }, [cycleLen]);

  let pan = null, showIntro = false, showOutro = false, closed = false, label = "";
  if (!flowOff && pancartes.length) {
    if (timed) {
      const t = clock % cycleLen;
      if (t < showDur) {
        const idx = Math.floor(t / per) % pancartes.length;
        pan = pancartes[idx];
        showIntro = t < introSec;
        showOutro = t >= showDur - outroSec;
        label = `Pancarte ${idx + 1}/${pancartes.length}`;
      } else { closed = true; label = "Closed"; }
    } else {
      const idx = Math.floor(clock / per) % pancartes.length;
      pan = pancartes[idx];
    }
  }
  const showingSomething = !flowOff && (pan || showIntro || showOutro);

  return (
    <div data-testid={`canvas-flow-${placement.id}`}
      onPointerDown={editable ? (e) => onPointerDownRegion(e, placement, "move") : undefined}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: placement.x, top: placement.y, width: placement.w, height: placement.h, overflow: "hidden",
        cursor: editable ? "move" : "default", outline: selected ? "2px dashed #5f6da6" : "none", outlineOffset: 3,
        opacity: flowOff ? 0.4 : 1,
        background: showingSomething ? "transparent" : "rgba(148,163,184,.12)" }}>
      {!flow ? (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8",
          border: "2px dashed rgba(148,163,184,.5)", borderRadius: 12, fontSize: 14, textAlign: "center", padding: 8 }}>
          Pick a flow in the panel →
        </div>
      ) : flowOff ? (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8",
          border: "2px dashed rgba(148,163,184,.5)", borderRadius: 12, fontSize: 14, textAlign: "center", padding: 8 }}>
          Flow disabled in this scene
        </div>
      ) : (!pancartes.length ? (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8",
          border: "2px dashed rgba(148,163,184,.5)", borderRadius: 12, fontSize: 14, textAlign: "center", padding: 8 }}>
          {allPancartes.length ? "All pancartes turned off" : "Flow has no pancartes yet"}
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0 }}>
          {pan && (
            <div key={pan.id} style={{ position: "absolute", inset: 0, ...flowEntranceStyle(flow) }}>
              <PancarteView pancarte={pan} sourceValues={sourceValues} />
            </div>
          )}
          {showIntro && <div style={{ position: "absolute", inset: 0, animation: "clara-in-fade .4s ease-out both" }}><OverlaySurface ov={sc.intro} /></div>}
          {showOutro && <div style={{ position: "absolute", inset: 0, animation: "clara-in-fade .4s ease-out both" }}><OverlaySurface ov={sc.outro} /></div>}
        </div>
      ))}
      {timed && !flowOff && showingSomething && (
        <span data-testid={`flow-phase-${placement.id}`}
          style={{ position: "absolute", top: 6, left: 6, fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase",
            color: "#fff", background: "rgba(15,23,42,.72)", padding: "2px 8px", borderRadius: 999, pointerEvents: "none" }}>
          {showIntro ? "Intro + " : ""}{showOutro ? "End + " : ""}{label}
        </span>
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

  const _bg = scene.background || {};
  const _bgMode = _bg.mode || (_bg.type === "stream" ? "stream" : (_bg.src && _bg.type !== "color" ? "media" : (_bg.type === "color" ? "color" : "transparent")));
  const stageBg = _bgMode === "color" && _bg.color
    ? { background: _bg.color }
    : { backgroundColor: "#0f172a", backgroundImage: "linear-gradient(45deg,#1e293b 25%,transparent 25%),linear-gradient(-45deg,#1e293b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1e293b 75%),linear-gradient(-45deg,transparent 75%,#1e293b 75%)", backgroundSize: "24px 24px", backgroundPosition: "0 0,0 12px,12px -12px,-12px 0" };

  return (
    <div ref={wrapRef} className="relative w-full" style={{ aspectRatio: `${scene.width} / ${scene.height}` }}>
      <div
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onClick={(e) => { if (editable && e.target === e.currentTarget) { onSelect?.(null); onSelectFlow?.(null); } }}
        style={{
          position: "absolute", top: 0, left: 0,
          width: scene.width, height: scene.height,
          transform: `scale(${scale})`, transformOrigin: "top left",
          ...stageBg,
          overflow: "hidden",
        }}
      >
        <BackgroundLayer background={scene.background} />
        {scene.background?.overlayColor && (scene.background?.overlayOpacity ?? 0) > 0 && (
          <div style={{ position: "absolute", inset: 0, background: scene.background.overlayColor, opacity: scene.background.overlayOpacity, pointerEvents: "none" }} />
        )}
        {(scene.elements || []).map((el) => {
          if (el.hidden && !editable) return null;
          const selected = editable && el.id === selectedId;
          return (
            <div key={el.id}
              data-testid={`canvas-el-${el.id}`}
              onPointerDown={(e) => onPointerDown(e, el, "move")}
              onClick={(e) => e.stopPropagation()}
              style={{ ...elBoxStyle(el), opacity: el.hidden ? 0.3 : (el.opacity != null ? el.opacity : 1), cursor: editable ? "move" : "default", outline: selected ? "2px solid #5f6da6" : "none", outlineOffset: 2 }}>
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
            selected={editable && pl.id === selectedFlowId} sourceValues={sourceValues}
            onPointerDownRegion={(e, item, mode) => onPointerDown(e, item, mode, "flow")} />
        ))}
      </div>
    </div>
  );
}
