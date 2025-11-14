"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, FileText, Bell, Home, Warehouse, PieChart, TrendingUp } from "lucide-react"

const navItems = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: Home,
  },
  {
    title: "Stock Management",
    href: "/dashboard/stock",
    icon: Warehouse,
  },
  {
    title: "Inventory Summary",
    href: "/dashboard/inventory",
    icon: PieChart,
  },
  {
    title: "Sales Predictions",
    href: "/dashboard/predictions",
    icon: TrendingUp,
  },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="w-64 border-r bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
      <div className="p-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-accent/50",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 transition-transform duration-200 group-hover:scale-110",
                    isActive ? "text-primary-foreground" : "",
                  )}
                />
                <span className="font-medium">{item.title}</span>
                {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </Link>
            )
          })}
        </div>

        <div className="mt-8 pt-4 border-t border-border/50">
          <div className="px-3 py-2">
            <p className="text-xs text-muted-foreground font-medium">Stock Manager Pro</p>
            <p className="text-xs text-muted-foreground/70">v2.1.0</p>
          </div>
        </div>
      </div>
    </nav>
  )
}
