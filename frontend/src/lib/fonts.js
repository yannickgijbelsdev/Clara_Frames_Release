// Custom font helpers: inject @font-face into the editor document and build picker values.

export const fontValue = (family) => `'${(family || "").replace(/'/g, "")}', sans-serif`;

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
    .filter((f) => f.family && f.url)
    .map((f) => `@font-face{font-family:'${f.family.replace(/'/g, "")}';src:url('${f.url}') format('${f.format || "woff2"}');font-display:swap;}`)
    .join("");
}
