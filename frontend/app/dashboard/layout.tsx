import type React from "react"
import { DashboardNav } from "@/components/dashboard/dashboard-nav"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="flex">
        <DashboardNav />
        <main className="flex-1 p-6 bg-gradient-to-br from-background to-muted/20 min-h-[calc(100vh-4rem)]">
          <div className="max-w-[1920px] mx-auto px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
