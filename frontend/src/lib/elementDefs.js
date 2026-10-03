import { Type, Clock, Image as ImageIcon, CalendarClock, Radio } from "lucide-react";

export const FONTS = ["'Outfit', sans-serif", "'Plus Jakarta Sans', sans-serif", "'JetBrains Mono', monospace", "Arial", "Georgia", "Impact"];
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export const templates = {
  text: () => ({ id: uid(), type: "text", x: 200, y: 200, w: 700, h: 120, rotation: 0, opacity: 1,
    props: { name: "text", text: "New text" }, style: { color: "#ffffff", fontSize: 64, fontWeight: 700, fontFamily: FONTS[0], textAlign: "left" } }),
  clock: () => ({ id: uid(), type: "clock", x: 1400, y: 60, w: 460, h: 120, rotation: 0, opacity: 1,
    props: { name: "clock", timezone: "Europe/Brussels", format: "HH:mm:ss" }, style: { color: "#ffffff", fontSize: 72, fontWeight: 700, fontFamily: FONTS[2], textAlign: "right" } }),
  image: () => ({ id: uid(), type: "image", x: 60, y: 60, w: 300, h: 120, rotation: 0, opacity: 1,
    props: { name: "logo", src: "", sourceId: "", fieldKey: "" }, style: { objectFit: "contain" } }),
  timed_text: () => ({ id: uid(), type: "timed_text", x: 200, y: 800, w: 900, h: 200, rotation: 0, opacity: 1,
    props: { name: "promo", text: "Timed message", image: "", imagePosition: "left", start: "", end: "", timezone: "Europe/Brussels" },
    style: { color: "#ffffff", fontSize: 48, fontWeight: 600, fontFamily: FONTS[1], backgroundColor: "#5f6da6", borderRadius: 18, padding: 24, textAlign: "left" } }),
  api_field: () => ({ id: uid(), type: "api_field", x: 200, y: 400, w: 600, h: 100, rotation: 0, opacity: 1,
    props: { name: "api", sourceId: "", fieldKey: "", prefix: "", suffix: "" }, style: { color: "#ffffff", fontSize: 56, fontWeight: 700, fontFamily: FONTS[0], textAlign: "left" } }),
};

export const TOOLS = [
  { type: "text", label: "Text", icon: Type },
  { type: "clock", label: "Clock", icon: Clock },
  { type: "image", label: "Image / Logo", icon: ImageIcon },
  { type: "timed_text", label: "Timed text + photo", icon: CalendarClock },
  { type: "api_field", label: "API field", icon: Radio },
];
