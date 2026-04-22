"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { Check, X, Info, Trash2 } from "lucide-react";

type ToastType = "success" | "error" | "info" | "delete";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  duration: number;
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { ...toast, id }]);

      if (toast.type !== "error") {
        setTimeout(() => removeToast(id), toast.duration);
      }
    },
    [removeToast]
  );

  const iconMap: Record<ToastType, React.ReactNode> = {
    success: <Check size={16} className="text-success" />,
    error: <X size={16} className="text-error" />,
    info: <Info size={16} className="text-accent" />,
    delete: <Trash2 size={16} className="text-text-secondary" />,
  };

  const borderMap: Record<ToastType, string> = {
    success: "border-l-success",
    error: "border-l-error",
    info: "border-l-accent",
    delete: "border-l-text-primary",
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 max-w-[360px]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`bg-bg-primary border border-border ${borderMap[toast.type]} border-l-4 rounded-lg shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-right`}
          >
            <div className="mt-0.5">{iconMap[toast.type]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.subtitle && (
                <p className="text-xs text-text-secondary truncate mt-0.5">
                  {toast.subtitle}
                </p>
              )}
            </div>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.onClick();
                  removeToast(toast.id);
                }}
                className="text-sm font-semibold text-accent hover:underline shrink-0"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              className="text-text-tertiary hover:text-text-primary shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
