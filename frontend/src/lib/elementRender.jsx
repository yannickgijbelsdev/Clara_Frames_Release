import { formatClock } from "@/lib/clock";

const ANIM_MAP = { pulse: "clara-pulse", fade: "clara-fade", spin: "clara-spin", bounce: "clara-bounce", float: "clara-float", blink: "clara-blink", slide: "clara-slide" };
export function animStyle(el) {
  const a = el.props?.animation;
  if (!a || a === "none" || !ANIM_MAP[a]) return {};
  const dur = el.props?.animationDuration || 2;
  const timing = a === "spin" ? "linear" : "ease-in-out";
  const dir = a === "slide" ? " alternate" : "";
  return { animation: `${ANIM_MAP[a]} ${dur}s ${timing} infinite${dir}` };
}

const ENTRANCE_MAP = { fade: "clara-in-fade", "slide-up": "clara-in-up", "slide-down": "clara-in-down", "slide-left": "clara-in-left", "slide-right": "clara-in-right", zoom: "clara-in-zoom" };
export function entranceStyle(el) {
  const e = el.props?.entrance;
  if (!e || e === "none" || !ENTRANCE_MAP[e]) return {};
  const dur = el.props?.entranceDuration || 0.6;
  const delay = el.props?.entranceDelay || 0;
  return { animation: `${ENTRANCE_MAP[e]} ${dur}s ease-out ${delay}s both` };
}

export function flowEntranceStyle(flow) {
  const e = flow?.entrance;
  if (!e || e === "none" || !ENTRANCE_MAP[e]) return {};
  const dur = flow.entranceDuration || 0.6;
  return { animation: `${ENTRANCE_MAP[e]} ${dur}s ease-out both` };
}

export function elBoxStyle(el) {
  const st = el.style || {};
  return {
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
}

export function ElementContent({ el, sourceValues }) {
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

export function BackgroundLayer({ background }) {
  const bg = background;
  if (!bg?.src) return null;
  const fit = bg.fit || "cover";
  if (bg.type === "video") {
    return <video key={bg.src} src={bg.src} autoPlay loop muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit === "contain" ? "contain" : "cover" }} />;
  }
  if (fit === "repeat") {
    return <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bg.src})`, backgroundRepeat: "repeat" }} />;
  }
  return <img src={bg.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit === "contain" ? "contain" : "cover" }} />;
}
