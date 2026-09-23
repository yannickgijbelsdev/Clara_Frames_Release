import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { Globe, ChevronDown, HelpCircle, LogOut } from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/scenes", label: "Scenes" },
  { to: "/sources", label: "API Sources" },
  { to: "/help", label: "vMix Help" },
];

export default function AppLayout({ children, title, subtitle, actions }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const initials = (user?.name || user?.email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <header className="sticky top-0 z-30 bg-[#F5F6F8]/90 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <button data-testid="logo-btn" onClick={() => navigate("/dashboard")}><Logo /></button>
            <div className="hidden sm:block h-5 w-px bg-slate-200/70" />
            <span className="hidden sm:block font-display font-semibold text-slate-900 text-[15px] whitespace-nowrap">
              Overlay Studio
            </span>
          </div>

          <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors max-w-[220px]">
            <Globe className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-sm font-medium text-slate-800 truncate">vMix Workspace</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          <nav className="hidden xl:flex items-center gap-0.5 ml-3 flex-1">
            {NAV.map(({ to, label }) => {
              const active = location.pathname === to || location.pathname.startsWith(to + "/");
              return (
                <NavLink key={to} to={to} data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                  className="relative flex items-center px-3.5 py-2 rounded-full text-sm font-medium transition-colors hover:text-slate-900 whitespace-nowrap">
                  {active && (
                    <motion.span layoutId="nav-pill"
                      className="absolute inset-0 bg-slate-900 rounded-full shadow-lg shadow-slate-900/25"
                      transition={{ type: "spring", stiffness: 400, damping: 34 }} />
                  )}
                  <span className={`relative z-10 ${active ? "text-white" : "text-slate-500"}`}>{label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 ml-auto">
            <button onClick={() => navigate("/help")} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors">
              <HelpCircle className="h-[19px] w-[19px]" />
            </button>
            <div className="pl-3 border-l border-slate-200/60 flex items-center gap-2">
              <span data-testid="user-avatar" className="h-9 w-9 rounded-full bg-rose-50 text-rose-600 font-semibold flex items-center justify-center shadow-sm">
                {initials}
              </span>
              <button data-testid="logout-btn" onClick={logout} title="Log out"
                className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <nav className="xl:hidden flex items-center gap-1 px-4 pb-3 overflow-x-auto">
          {NAV.map(({ to, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `flex items-center px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${isActive ? "bg-slate-900 text-white" : "text-slate-600 bg-slate-100"}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <motion.main key={location.pathname}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="max-w-[1400px] mx-auto px-6 py-8">
        {(title || subtitle || actions) && (
          <div className="flex items-start justify-between mb-7 gap-4 flex-wrap">
            <div>
              {title && <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{title}</h1>}
              {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        )}
        {children}
      </motion.main>
    </div>
  );
}
