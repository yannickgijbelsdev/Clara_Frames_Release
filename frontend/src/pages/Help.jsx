import AppLayout from "@/components/AppLayout";
import { MonitorPlay, FileJson, ShieldCheck, Radio } from "lucide-react";

const steps = [
  { icon: Radio, title: "1 · Add API sources", body: "Go to API Sources and add weather, a world clock, or your own API with field mappings. Test the fetch to confirm the data comes through." },
  { icon: MonitorPlay, title: "2 · Design a scene", body: "In a scene, drag text, a logo, a clock, timed text with a photo, or API fields onto the 16:9 canvas. Style each element and position it exactly." },
  { icon: FileJson, title: "3 · Export", body: "Open Export. Use the Web Browser URL as a single input in vMix for the full live overlay, or bind vMix Title fields to the JSON / XML data source." },
];

export default function Help() {
  return (
    <AppLayout title="vMix Help" subtitle="From design to broadcast in three steps.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {steps.map((s) => (
          <div key={s.title} className="bg-white rounded-3xl clara-soft p-6">
            <span className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#8f99c5] to-[#545f8f] text-white flex items-center justify-center mb-3"><s.icon className="h-5 w-5" /></span>
            <h3 className="font-display text-lg font-semibold text-slate-900">{s.title}</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl clara-soft p-6 space-y-4">
        <h2 className="font-display text-xl font-semibold text-slate-900">Web Browser input (full overlay)</h2>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1.5">
          <li>In vMix click <b>Add Input</b> → <b>Web Browser</b>.</li>
          <li>Paste the <b>overlay URL</b> from the Export page.</li>
          <li>Set the resolution to <b>1920 × 1080</b> and tick <b>transparent background</b>.</li>
          <li>The scene renders live — clocks tick, timed text appears on schedule, API values refresh automatically.</li>
        </ol>

        <h2 className="font-display text-xl font-semibold text-slate-900 pt-2">Data Source (Title binding)</h2>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1.5">
          <li>In vMix open <b>Settings → Data Sources → Add</b> and pick <b>JSON</b> or <b>XML</b>.</li>
          <li>Paste the matching URL from the Export page.</li>
          <li>On a Title input, map each text field to a <b>column name</b> — this is the "field name" you set on each element.</li>
        </ol>
      </div>

      <div className="mt-4 flex items-center gap-4 bg-white/70 backdrop-blur-md rounded-2xl clara-soft px-4 py-3.5 ring-1 ring-amber-100/70">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0"><ShieldCheck className="h-[18px] w-[18px]" /></span>
        <div className="text-sm text-slate-600 flex-1 leading-snug"><b className="text-slate-900">Heads up.</b> Export links contain a secret token. Use “New link” on the Export page to instantly revoke access if a URL leaks.</div>
      </div>
    </AppLayout>
  );
}
