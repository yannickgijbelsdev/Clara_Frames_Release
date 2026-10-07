// Custom font helpers: inject @font-face into the editor document and build picker values.

export const fontValue = (family) => `'${(family || "").replace(/'/g, "")}', sans-serif`;

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const fontSrc = (f) => (f.id ? `${BACKEND}/api/public/font/${f.id}` : f.url);

export function injectFontFaces(fonts) {
  if (typeof document === "undefined") return;
  const id = "clara-custom-fonts";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = (fonts || [])
    .filter((f) => f.family && (f.id || f.url))
    .map((f) => `@font-face{font-family:'${f.family.replace(/'/g, "")}';src:url('${fontSrc(f)}') format('${f.format || "woff2"}');font-display:swap;}`)
    .join("");
}
