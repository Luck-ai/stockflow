"use client"

import { ThemeToggle } from "@/components/ui/theme-toggle"

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">SM</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Stock Management
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <ThemeToggle />

        </div>
      </div>
    </header>
  )
}
