export function Logo({ className = "" }) {
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 ${className}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4l7 8-7 8" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 4l7 8-7 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55"/>
      </svg>
    </span>
  );
}
