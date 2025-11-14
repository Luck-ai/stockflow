"use client"

import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastVariant = 'success' | 'error' | 'default'

interface ToastItem {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
}

export function Toaster() {
  return (
    // Only render the viewport here — provider will be mounted at app level
    <ToastPrimitive.Viewport className="fixed bottom-6 right-6 z-50 flex flex-col gap-2" />
  )
}

export function Toast({ title, description, variant = 'default', open, onOpenChange }: {
  title?: string
  description?: string
  variant?: ToastVariant
  open: boolean
  onOpenChange: (b: boolean) => void
}) {
  return (
    <ToastPrimitive.Root
      className={cn(
        'rounded-md shadow-md p-3 w-80',
        variant === 'success'
          ? 'bg-green-600/10 backdrop-blur-sm border border-green-400/30'
          : variant === 'error'
          ? 'bg-red-600/10 backdrop-blur-sm border border-red-400/30'
          : 'bg-card/90'
      )}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          {title && <div className="font-medium">{title}</div>}
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
        </div>
        <ToastPrimitive.Close asChild>
          <button className="text-muted-foreground"><X className="h-4 w-4" /></button>
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  )
}
