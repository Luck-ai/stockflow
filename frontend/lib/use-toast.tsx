"use client"

import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { Toaster, Toast } from '@/components/ui/toaster'
import { nanoid } from 'nanoid'

type Variant = 'success' | 'error' | 'default'

type PushFn = (opts: { title?: string; description?: string; variant?: Variant }) => void

const ToastContext = React.createContext<{ push: PushFn } | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Array<{ id: string; title?: string; description?: string; variant?: Variant; open?: boolean }>>([])

  const push: PushFn = React.useCallback(({ title, description, variant = 'default' }) => {
    const id = nanoid()
    setToasts((t) => [...t, { id, title, description, variant, open: true }])
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      <ToastPrimitive.Provider swipeDirection="right">
        <Toaster />
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            open={!!t.open}
            onOpenChange={(open) => setToasts((prev) => prev.map(p => p.id === t.id ? { ...p, open } : p))}
            duration={3000} // auto-dismiss after 3000ms (3 seconds)
          >
            <Toast title={t.title} description={t.description} variant={t.variant} open={!!t.open} onOpenChange={(open) => setToasts((prev) => prev.map(p => p.id === t.id ? { ...p, open } : p))} />
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useAppToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useAppToast must be used within ToastProvider')
  return ctx
}
