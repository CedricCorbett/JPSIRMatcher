import { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import clsx from 'clsx'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({
  addToast: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

let toastId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col gap-3" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItemComponent key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  )
}

const typeLabels: Record<ToastType, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Info',
}

function ToastItemComponent({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green" />,
    error: <AlertCircle className="w-5 h-5 text-red" />,
    info: <Info className="w-5 h-5 text-blue" />,
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-slide-in min-w-[320px] max-w-[420px]',
        'bg-bg-card border-border'
      )}
    >
      {icons[toast.type]}
      <span className="sr-only">{typeLabels[toast.type]}:</span>
      <span className="flex-1 text-sm text-text-primary">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-secondary transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function Toast() {
  return null
}
