import { motion } from "framer-motion";

export function PrimaryButton({ children, onClick, icon: Icon, className = "", ...props }) {
  return (
    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      onClick={onClick} {...props}
      className={`inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-full transition-colors disabled:opacity-60 ${className}`}>
      {Icon && <Icon className="h-4 w-4" />}{children}
    </motion.button>
  );
}

export function SecondaryButton({ children, onClick, icon: Icon, className = "", ...props }) {
  return (
    <button onClick={onClick} {...props}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-full hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-60 ${className}`}>
      {Icon && <Icon className="h-4 w-4" />}{children}
    </button>
  );
}
