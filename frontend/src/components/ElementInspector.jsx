import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { ImageUpload } from "@/components/ImageUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { FONTS } from "@/lib/elementDefs";

function RoundingControl({ sel, updateStyle }) {
  const r = sel.style?.borderRadius ?? 0;
  const circle = Math.round(Math.min(sel.w || 400, sel.h || 400) / 2);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><Label>Corner radius</Label><span className="text-xs text-slate-400">{r}px</span></div>
      <input type="range" min="0" max={circle} value={Math.min(r, circle)} onChange={(e) => updateStyle({ borderRadius: parseInt(e.target.value) })} className="w-full accent-brand-600" data-testid="prop-radius" />
      <div className="flex gap-1.5">
        <button type="button" onClick={() => updateStyle({ borderRadius: 0 })} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 hover:bg-slate-50" data-testid="radius-square">Square</button>
        <button type="button" onClick={() => updateStyle({ borderRadius: 24 })} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 hover:bg-slate-50" data-testid="radius-rounded">Rounded</button>
        <button type="button" onClick={() => updateStyle({ borderRadius: circle })} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 hover:bg-slate-50" data-testid="radius-circle">Circle</button>
      </div>
    </div>
  );
}

export default function ElementInspector({ sel, sources = [], overlays = [], forms = [], updateProps, updateStyle, updateEl, delEl, footer = null, allowTiming = false }) {
  const rawFields = (sources.find((s) => s.id === sel?.props?.sourceId)?.fields || []).filter((f) => (f.key || "").trim());
  const srcFields = rawFields.length ? rawFields : [{ key: "text", label: "Response text" }];
  const triggerSrcId = sel?.timing?.triggerSource || sel?.props?.sourceId;
  const triggerRaw = (sources.find((s) => s.id === triggerSrcId)?.fields || []).filter((f) => (f.key || "").trim());
  const triggerFields = triggerRaw.length ? triggerRaw : [{ key: "text", label: "Response text" }];
  return (
    <div className="space-y-3" data-testid="properties-panel">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">{sel.type.replace("_", " ")}</span>
        <button data-testid="delete-el-btn" onClick={delEl} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
      </div>

      <div className="space-y-1.5"><Label>Field name (vMix column)</Label>
        <Input value={sel.props.name || ""} onChange={(e) => updateProps({ name: e.target.value })} className="rounded-xl text-sm font-mono" data-testid="prop-name" /></div>

      {(sel.type === "text") && (
        <div className="space-y-1.5"><Label>Text</Label>
          <Textarea value={sel.props.text || ""} onChange={(e) => updateProps({ text: e.target.value })} className="rounded-xl text-sm" data-testid="prop-text" /></div>
      )}

      {sel.type === "clock" && (
        <>
          <div className="space-y-1.5"><Label>Timezone (IANA)</Label>
            <Input value={sel.props.timezone || ""} onChange={(e) => updateProps({ timezone: e.target.value })} className="rounded-xl text-sm" placeholder="Europe/Brussels" /></div>
          <div className="space-y-1.5"><Label>Format</Label>
            <Input value={sel.props.format || ""} onChange={(e) => updateProps({ format: e.target.value })} className="rounded-xl text-sm font-mono" placeholder="HH:mm:ss" /></div>
          <p className="text-[11px] text-slate-400">Tokens: HH mm ss DD MM YYYY MMMM dddd</p>
        </>
      )}

      {sel.type === "image" && (
        <>
          <div className="space-y-1.5"><Label>Image / logo</Label>
            <ImageUpload value={sel.props.src} onChange={(url) => updateProps({ src: url })} testid="prop-src" /></div>
          <div className="space-y-1.5"><Label>Live source (optional)</Label>
            <Select value={sel.props.sourceId || "none"} onValueChange={(v) => updateProps({ sourceId: v === "none" ? "" : v, fieldKey: v === "none" ? "" : (sel.props.fieldKey || "artwork") })}>
              <SelectTrigger className="rounded-xl" data-testid="prop-img-source"><SelectValue placeholder="Static image" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Static image</SelectItem>
                {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select></div>
          {sel.props.sourceId && (
            <div className="space-y-1.5"><Label>Image field</Label>
              <Select value={sel.props.fieldKey || ""} onValueChange={(v) => updateProps({ fieldKey: v })}>
                <SelectTrigger className="rounded-xl" data-testid="prop-img-field"><SelectValue placeholder="Choose field" /></SelectTrigger>
                <SelectContent>{srcFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.key}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">Live beeld-URL, bv. het veld <code className="font-mono">artwork</code> van "Nu Speelt".</p>
            </div>
          )}
          <RoundingControl sel={sel} updateStyle={updateStyle} />
        </>
      )}

      {sel.type === "timed_text" && (
        <>
          <div className="space-y-1.5"><Label>Text</Label>
            <Textarea value={sel.props.text || ""} onChange={(e) => updateProps({ text: e.target.value })} className="rounded-xl text-sm" data-testid="prop-text" /></div>
          <div className="space-y-1.5"><Label>Photo</Label>
            <ImageUpload value={sel.props.image} onChange={(url) => updateProps({ image: url })} testid="prop-photo" /></div>
          <div className="space-y-1.5"><Label>Photo position</Label>
            <Select value={sel.props.imagePosition || "left"} onValueChange={(v) => updateProps({ imagePosition: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="top">Top</SelectItem></SelectContent>
            </Select></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Show from</Label><Input type="time" value={sel.props.start || ""} onChange={(e) => updateProps({ start: e.target.value })} className="rounded-xl text-sm" data-testid="prop-start" /></div>
            <div className="space-y-1.5"><Label>until</Label><Input type="time" value={sel.props.end || ""} onChange={(e) => updateProps({ end: e.target.value })} className="rounded-xl text-sm" data-testid="prop-end" /></div>
          </div>
          <p className="text-[11px] text-slate-400">Leave times empty to always show.</p>
        </>
      )}

      {sel.type === "api_field" && (
        <>
          <div className="space-y-1.5"><Label>Source</Label>
            <Select value={sel.props.sourceId || ""} onValueChange={(v) => updateProps({ sourceId: v, fieldKey: "" })}>
              <SelectTrigger className="rounded-xl" data-testid="prop-source"><SelectValue placeholder="Choose source" /></SelectTrigger>
              <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>Field</Label>
            <Select value={sel.props.fieldKey || ""} onValueChange={(v) => updateProps({ fieldKey: v })}>
              <SelectTrigger className="rounded-xl" data-testid="prop-field"><SelectValue placeholder="Choose field" /></SelectTrigger>
              <SelectContent>{srcFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.key}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>Display as</Label>
            <Select value={sel.props.display || "text"} onValueChange={(v) => updateProps({ display: v })}>
              <SelectTrigger className="rounded-xl" data-testid="prop-display"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="image">Image (render URL as picture)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">Choose <b>Image</b> when the field is a picture URL (e.g. <code className="font-mono">artwork</code> or a presenter photo).</p>
          </div>
          {sel.props.display === "image" ? (
            <>
              <div className="space-y-1.5"><Label>Fit</Label>
                <Select value={sel.style?.objectFit || "contain"} onValueChange={(v) => updateStyle({ objectFit: v })}>
                  <SelectTrigger className="rounded-xl" data-testid="prop-apiimg-fit"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="contain">Contain</SelectItem><SelectItem value="cover">Cover</SelectItem></SelectContent>
                </Select></div>
              <RoundingControl sel={sel} updateStyle={updateStyle} />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Prefix</Label><Input value={sel.props.prefix || ""} onChange={(e) => updateProps({ prefix: e.target.value })} className="rounded-xl text-sm" /></div>
              <div className="space-y-1.5"><Label>Suffix</Label><Input value={sel.props.suffix || ""} onChange={(e) => updateProps({ suffix: e.target.value })} className="rounded-xl text-sm" /></div>
            </div>
          )}
        </>
      )}

      {sel.type === "overlay" && (
        <>
          <div className="space-y-1.5"><Label>Overlay source</Label>
            <Select value={sel.props.overlayId || ""} onValueChange={(v) => { const o = overlays.find((x) => x.id === v); updateProps({ overlayId: v, url: o?.url || "", kind: o?.kind || "", name: o?.name || sel.props.name }); }}>
              <SelectTrigger className="rounded-xl" data-testid="prop-overlay"><SelectValue placeholder="Choose an overlay" /></SelectTrigger>
              <SelectContent>{overlays.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} · {o.kind}</SelectItem>)}</SelectContent>
            </Select>
            {overlays.length === 0 && <p className="text-[11px] text-slate-400">Upload overlays on the <b>Overlays</b> page first.</p>}
            {sel.props.kind === "html" && <p className="text-[11px] text-slate-400">HTML overlay shown in a transparent iframe.</p>}
          </div>
          {sel.props.kind && sel.props.kind !== "html" && (
            <div className="space-y-1.5"><Label>Fit</Label>
              <Select value={sel.style.objectFit || "contain"} onValueChange={(v) => updateStyle({ objectFit: v })}>
                <SelectTrigger className="rounded-xl" data-testid="prop-overlay-fit"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="contain">Fit (contain)</SelectItem><SelectItem value="cover">Fill (cover)</SelectItem></SelectContent>
              </Select></div>
          )}
          <RoundingControl sel={sel} updateStyle={updateStyle} />
        </>
      )}

      {sel.type === "ticker" && (
        <>
          <div className="space-y-1.5"><Label>Messages from form</Label>
            <Select value={sel.props.formId || "none"} onValueChange={(v) => updateProps({ formId: v === "none" ? "" : v })}>
              <SelectTrigger className="rounded-xl" data-testid="prop-ticker-form"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value="none">None (free text only)</SelectItem>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">Only messages marked <b>Live</b> in Messages appear here.</p>
          </div>
          {sel.props.formId && (() => {
            const tf = forms.find((f) => f.id === sel.props.formId);
            const flds = tf?.fields || [];
            const selKeys = sel.props.fields || [];
            if (!flds.length) return null;
            const toggleKey = (k) => updateProps({ fields: selKeys.includes(k) ? selKeys.filter((x) => x !== k) : [...selKeys, k] });
            return (
              <div className="space-y-1.5">
                <Label>Fields to show</Label>
                <div className="flex flex-wrap gap-1.5" data-testid="ticker-fields">
                  {flds.map((f) => (
                    <button key={f.key} type="button" data-testid={`ticker-field-${f.key}`} onClick={() => toggleKey(f.key)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${selKeys.includes(f.key) ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      {f.label || f.key}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">{selKeys.length ? "Showing selected fields, in the order you tap them." : "Nothing selected = all fields."}</p>
              </div>
            );
          })()}
          <div className="space-y-1.5"><Label>Free text (scrolls along)</Label>
            <Input value={sel.props.freeText || ""} onChange={(e) => updateProps({ freeText: e.target.value })} className="rounded-xl text-sm" data-testid="prop-ticker-text" placeholder="e.g. Welcome to Radio GRK" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Separator icon</Label>
              <Select value={sel.props.icon || "\u25CF"} onValueChange={(v) => updateProps({ icon: v })}>
                <SelectTrigger className="rounded-xl" data-testid="prop-ticker-icon"><SelectValue /></SelectTrigger>
                <SelectContent>{["\u25CF", "\u2605", "\u266A", "\u25C6", "\u25B2", "\u25A0", "\u27A4", "\u2726", "\u2014", "|", "\u2665"].map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>Speed</Label>
              <Select value={String(sel.props.speed ?? 0.35)} onValueChange={(v) => updateProps({ speed: parseFloat(v) })}>
                <SelectTrigger className="rounded-xl" data-testid="prop-ticker-speed"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0.6">Slow</SelectItem><SelectItem value="0.35">Normal</SelectItem><SelectItem value="0.18">Fast</SelectItem></SelectContent>
              </Select></div>
          </div>
        </>
      )}

      {sel.type !== "image" && sel.type !== "overlay" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Font size</Label><Input type="number" value={sel.style.fontSize || 40} onChange={(e) => updateStyle({ fontSize: parseInt(e.target.value) || 40 })} className="rounded-xl text-sm" /></div>
            <div className="space-y-1.5"><Label>Color</Label><input type="color" value={sel.style.color || "#ffffff"} onChange={(e) => updateStyle({ color: e.target.value })} className="w-full h-9 rounded-lg border border-slate-200 cursor-pointer" data-testid="prop-color" /></div>
          </div>
          <div className="space-y-1.5"><Label>Font</Label>
            <Select value={sel.style.fontFamily || FONTS[0]} onValueChange={(v) => updateStyle({ fontFamily: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f.split(",")[0].replace(/'/g, "")}</span></SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Weight</Label>
              <Select value={String(sel.style.fontWeight || 600)} onValueChange={(v) => updateStyle({ fontWeight: parseInt(v) })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{[300, 400, 500, 600, 700, 800].map((w) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>Align</Label>
              <Select value={sel.style.textAlign || "left"} onValueChange={(v) => updateStyle({ textAlign: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{["left", "center", "right"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <div className="space-y-1.5"><Label>Background</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={sel.style.backgroundColor || "#000000"} onChange={(e) => updateStyle({ backgroundColor: e.target.value })} className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer" />
              <SecondaryButton onClick={() => updateStyle({ backgroundColor: undefined })} className="text-xs py-1.5">Clear</SecondaryButton>
            </div></div>
        </>
      )}

      {allowTiming && (sel.type === "api_field" || sel.type === "image" || sel.type === "overlay") && (
        <div className="space-y-1.5 pt-3 border-t border-slate-100">
          <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">On-screen timing</Label>
          <Select value={sel.timing?.mode || "always"}
            onValueChange={(v) => updateEl(sel.id, { timing: { ...(sel.timing || {}), mode: v, showSeconds: sel.timing?.showSeconds ?? 10, gap: sel.timing?.gap ?? 5, gapUnit: sel.timing?.gapUnit ?? "min" } })}>
            <SelectTrigger className="rounded-xl" data-testid="el-timing-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always visible</SelectItem>
              <SelectItem value="interval">Show on interval</SelectItem>
              <SelectItem value="onchange">Show when data changes</SelectItem>
            </SelectContent>
          </Select>
          {sel.timing?.mode && sel.timing.mode !== "always" && (
            <div className="space-y-1.5"><Label>Stays on screen (sec)</Label>
              <Input type="number" min="1" value={sel.timing?.showSeconds ?? 10}
                onChange={(e) => updateEl(sel.id, { timing: { ...sel.timing, showSeconds: parseInt(e.target.value) || 1 } })}
                className="rounded-xl text-sm" data-testid="el-timing-show" /></div>
          )}
          {sel.timing?.mode === "interval" && (
            <>
              <div className="space-y-1.5"><Label>Gap between appearances</Label>
                <div className="flex gap-2">
                  <Input type="number" min="0" value={sel.timing?.gap ?? 5}
                    onChange={(e) => updateEl(sel.id, { timing: { ...sel.timing, gap: parseFloat(e.target.value) || 0 } })}
                    className="rounded-xl text-sm" data-testid="el-timing-gap" />
                  <Select value={sel.timing?.gapUnit || "min"} onValueChange={(v) => updateEl(sel.id, { timing: { ...sel.timing, gapUnit: v } })}>
                    <SelectTrigger className="rounded-xl w-32" data-testid="el-timing-gap-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sec">seconds</SelectItem>
                      <SelectItem value="min">minutes</SelectItem>
                      <SelectItem value="hour">hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">Klok-uitgelijnd: verschijnt, blijft {sel.timing?.showSeconds ?? 10}s, verdwijnt, herhaalt.</p>
            </>
          )}
          {sel.timing?.mode === "onchange" && (
            <>
              <div className="space-y-1.5"><Label>Trigger source</Label>
                <Select value={sel.timing?.triggerSource || sel.props?.sourceId || ""}
                  onValueChange={(v) => updateEl(sel.id, { timing: { ...sel.timing, triggerSource: v, triggerField: "" } })}>
                  <SelectTrigger className="rounded-xl" data-testid="el-trigger-source"><SelectValue placeholder="Choose source" /></SelectTrigger>
                  <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Trigger field</Label>
                <Select value={sel.timing?.triggerField || sel.props?.fieldKey || ""}
                  onValueChange={(v) => updateEl(sel.id, { timing: { ...sel.timing, triggerField: v } })}>
                  <SelectTrigger className="rounded-xl" data-testid="el-trigger-field"><SelectValue placeholder="Choose field" /></SelectTrigger>
                  <SelectContent>{triggerFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.key}</SelectItem>)}</SelectContent>
                </Select></div>
              <p className="text-[11px] text-slate-400">Verschijnt {sel.timing?.showSeconds ?? 10}s zodra dit veld verandert (bv. de titel van een nieuw Now-Playing-nummer), daarna weg. Koppel hier je achtergrond-afbeelding of overlay aan je now-playing-bron.</p>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100">
        {["x", "y", "w", "h"].map((k) => (
          <div key={k} className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">{k}</Label>
            <Input type="number" value={sel[k]} onChange={(e) => updateEl(sel.id, { [k]: parseInt(e.target.value) || 0 })} className="rounded-lg text-xs px-2" /></div>
        ))}
      </div>
      <div className="space-y-1.5"><Label>Opacity: {Math.round((sel.opacity ?? 1) * 100)}%</Label>
        <input type="range" min="0" max="1" step="0.05" value={sel.opacity ?? 1} onChange={(e) => updateEl(sel.id, { opacity: parseFloat(e.target.value) })} className="w-full accent-brand-600" /></div>

      <div className="space-y-1.5 pt-3 border-t border-slate-100">
        <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Entrance (plays once)</Label>
        <Select value={sel.props.entrance || "none"} onValueChange={(v) => updateProps({ entrance: v })}>
          <SelectTrigger className="rounded-xl" data-testid="prop-entrance"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["none", "fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        {sel.props.entrance && sel.props.entrance !== "none" && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-24 shrink-0">Duration {sel.props.entranceDuration || 0.6}s</span>
              <input type="range" min="0.2" max="3" step="0.1" value={sel.props.entranceDuration ?? 0.6} onChange={(e) => updateProps({ entranceDuration: parseFloat(e.target.value) })} className="flex-1 accent-brand-600" data-testid="prop-entrance-dur" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-24 shrink-0">Delay {sel.props.entranceDelay || 0}s</span>
              <input type="range" min="0" max="5" step="0.1" value={sel.props.entranceDelay ?? 0} onChange={(e) => updateProps({ entranceDelay: parseFloat(e.target.value) })} className="flex-1 accent-brand-600" data-testid="prop-entrance-delay" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5 pt-3 border-t border-slate-100">
        <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Animation</Label>
        <Select value={sel.props.animation || "none"} onValueChange={(v) => updateProps({ animation: v })}>
          <SelectTrigger className="rounded-xl" data-testid="prop-animation"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["none", "pulse", "fade", "spin", "bounce", "float", "blink", "slide"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        {sel.props.animation && sel.props.animation !== "none" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-20 shrink-0">Speed {sel.props.animationDuration || 2}s</span>
            <input type="range" min="0.3" max="6" step="0.1" value={sel.props.animationDuration ?? 2} onChange={(e) => updateProps({ animationDuration: parseFloat(e.target.value) })} className="flex-1 accent-brand-600" data-testid="prop-anim-speed" />
          </div>
        )}
      </div>

      {footer}
    </div>
  );
}
