import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { ImageUpload } from "@/components/ImageUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { FONTS } from "@/lib/elementDefs";

export default function ElementInspector({ sel, sources = [], updateProps, updateStyle, updateEl, delEl, footer = null }) {
  const srcFields = sources.find((s) => s.id === sel?.props?.sourceId)?.fields || [];
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
        <div className="space-y-1.5"><Label>Image / logo</Label>
          <ImageUpload value={sel.props.src} onChange={(url) => updateProps({ src: url })} testid="prop-src" /></div>
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
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Prefix</Label><Input value={sel.props.prefix || ""} onChange={(e) => updateProps({ prefix: e.target.value })} className="rounded-xl text-sm" /></div>
            <div className="space-y-1.5"><Label>Suffix</Label><Input value={sel.props.suffix || ""} onChange={(e) => updateProps({ suffix: e.target.value })} className="rounded-xl text-sm" /></div>
          </div>
        </>
      )}

      {sel.type !== "image" && (
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
