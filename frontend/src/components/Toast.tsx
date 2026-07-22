import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { X, Check, AlertTriangle, Info } from "lucide-react";

type Kind = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  kind: Kind;
}

interface ToastCtx {
  toast: (message: string, kind?: Kind) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const add = useCallback((message: string, kind: Kind = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const remove = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const iconMap = { success: Check, error: AlertTriangle, info: Info };
  const dotMap = {
    success: "before:bg-[var(--color-green)]",
    error: "before:bg-[var(--color-red)]",
    info: "before:bg-[var(--color-gray-400)]",
  };

  return (
    <Ctx value={{ toast: add }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((t) => {
          const Icon = iconMap[t.kind];
          return (
            <div key={t.id} className={`pointer-events-auto bg-[#151515] border border-[rgba(255,255,255,0.08)] rounded-xl pl-3.5 pr-3 py-3 flex items-center gap-3 min-w-[260px] max-w-[380px] animate-slide-in-right shadow-[0_8px_32px_rgba(0,0,0,0.6)]`} >
              <Icon size={15} className={t.kind === "success" ? "text-[var(--color-green)]" : t.kind === "error" ? "text-[var(--color-red)]" : "text-[var(--color-gray-400)]"} />
              <span className="text-sm text-[var(--color-gray-200)] flex-1 leading-snug font-[400]">{t.message}</span>
              <button onClick={() => remove(t.id)} className="text-[var(--color-gray-500)] hover:text-[var(--color-gray-200)] transition-colors p-0.5">
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx>
  );
}
