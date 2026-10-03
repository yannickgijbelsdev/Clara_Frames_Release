import { useState } from "react";
import { Eye, EyeOff, Trash2, GripVertical, Type } from "lucide-react";
import { TOOLS } from "@/lib/elementDefs";

const ICON = Object.fromEntries(TOOLS.map((t) => [t.type, t.icon]));

// Reference 2 (layer tree) style, kept in the Clara Frames light theme.
// Displays front-most layers on top (array end = front). Drag to reorder (z-index).
export default function LayersPanel({ elements = [], selectedId, onSelect, onReorder, onToggleVisible, onDelete }) {
  const [dragPos, setDragPos] = useState(null);
  const [overPos, setOverPos] = useState(null);

  // map array -> display order (front first)
  const display = elements.map((el, i) => ({ el, i })).reverse();

  const drop = (dropPos) => {
    if (dragPos === null || dragPos === dropPos) { setDragPos(null); setOverPos(null); return; }
    const arr = [...elements];
    const fromArr = display[dragPos].i;
    const toArr = display[dropPos].i;
    const [moved] = arr.splice(fromArr, 1);
    arr.splice(toArr, 0, moved);
    onReorder(arr);
    setDragPos(null); setOverPos(null);
  };

  if (!elements.length) {
    return <p className="text-xs text-slate-400 px-1 py-2" data-testid="layers-empty">No layers yet — add an element above.</p>;
  }

  return (
    <div className="space-y-1" data-testid="layers-panel">
      {display.map((d, pos) => {
        const el = d.el;
        const Icon = ICON[el.type] || Type;
        const selected = el.id === selectedId;
        const hidden = !!el.hidden;
        return (
          <div key={el.id}
            draggable
            onDragStart={() => setDragPos(pos)}
            onDragOver={(e) => { e.preventDefault(); setOverPos(pos); }}
            onDragEnd={() => { setDragPos(null); setOverPos(null); }}
            onDrop={() => drop(pos)}
            onClick={() => onSelect(el.id)}
            data-testid={`layer-row-${el.id}`}
            className={`group flex items-center gap-1.5 pl-1.5 pr-1 py-2 rounded-xl border cursor-pointer clara-trans ${
              selected ? "border-brand-300 bg-brand-50/70 ring-1 ring-brand-100" : "border-slate-100 hover:bg-slate-50"
            } ${overPos === pos && dragPos !== null ? "border-brand-400 border-dashed" : ""}`}>
            <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing" />
            <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-brand-600" : "text-slate-400"}`} />
            <span className={`text-sm truncate flex-1 ${hidden ? "text-slate-300 line-through" : "text-slate-700"}`}>
              {el.props?.name?.trim() || el.type.replace("_", " ")}
            </span>
            <button type="button" data-testid={`layer-visible-${el.id}`} title={hidden ? "Show" : "Hide"}
              onClick={(e) => { e.stopPropagation(); onToggleVisible(el.id); }}
              className="h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">
              {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button type="button" data-testid={`layer-delete-${el.id}`} title="Delete layer"
              onClick={(e) => { e.stopPropagation(); onDelete(el.id); }}
              className="h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0 opacity-0 group-hover:opacity-100 clara-trans">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
