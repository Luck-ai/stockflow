"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Bar, BarChart } from "recharts"
import { apiFetch } from "@/lib/api"

interface SalesChartProps {
  productId: string
  salesData?: any[]
  refreshTrigger?: number // Add this to trigger re-fetching
}

interface SalesRecord {
  id: number
  product_id: number
  user_id: number
  quantity: number
  sale_price: number
  sale_date: string
}

export function SalesChart({ productId, salesData: propSalesData, refreshTrigger }: SalesChartProps) {
  const [salesData, setSalesData] = useState<SalesRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)

    // Do not generate mock sales data. If `propSalesData` is provided from the parent
    // (backend), use it. Otherwise, keep local state empty and show the empty state.
    useEffect(() => {
      // If parent provided sales data, avoid local fetching/generation.
      if (Array.isArray(propSalesData)) {
        setSalesData(propSalesData as SalesRecord[])
        setLoading(false)
        setError(null)
      } else {
        // Clear any previously set local data so mock data is never used.
        setSalesData([])
        setLoading(false)
        setError(null)
      }
    }, [propSalesData, refreshTrigger])

  // Detect dark mode for chart color adjustments
  useEffect(() => {
    const detect = () => {
      try {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        const htmlHasDark = document && document.documentElement && document.documentElement.classList.contains('dark')
        setIsDark(!!(htmlHasDark || prefersDark))
      } catch (e) {
        setIsDark(false)
      }
    }
    detect()
    // optional: listen for changes
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (ev: MediaQueryListEvent) => setIsDark(ev.matches)
    if (mq && mq.addEventListener) mq.addEventListener('change', listener)
    return () => { if (mq && mq.removeEventListener) mq.removeEventListener('change', listener) }
  }, [])

  // Transform real sales data into chart format
  const transformSalesData = (sales: SalesRecord[]) => {
    // Add proper array validation
    if (!Array.isArray(sales) || sales.length === 0) return []
    
    // Group sales by month
    const monthlyData: { [key: string]: { sales: number, revenue: number, monthNumber: number } } = {}
    
    sales.forEach(sale => {
      const date = new Date(sale.sale_date)
      const monthKey = date.toLocaleDateString('en-US', { month: 'short' })
      const monthNumber = date.getMonth() // 0-11 for sorting
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { sales: 0, revenue: 0, monthNumber }
      }
      
      monthlyData[monthKey].sales += sale.quantity
      monthlyData[monthKey].revenue += sale.quantity * sale.sale_price
    })
    
    // Convert to chart format and sort by month order
    return Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        sales: data.sales,
        revenue: Math.round(data.revenue * 100) / 100,
        monthNumber: data.monthNumber
      }))
      .sort((a, b) => a.monthNumber - b.monthNumber)
  }
  
  // Use provided salesData or fetched data, ensure it's always an array
  const safeData = Array.isArray(propSalesData) ? propSalesData : Array.isArray(salesData) ? salesData : []
  const displayData = transformSalesData(safeData)
  
  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[300px] text-center">
        <div>
          <div className="text-muted-foreground dark:text-gray-300 mb-2">Loading sales data...</div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-[300px] text-center">
        <div>
          <div className="text-destructive mb-2">Error loading sales data</div>
          <p className="text-sm text-muted-foreground dark:text-gray-300">{error}</p>
        </div>
      </div>
    )
  }
  
  // Show empty state if no data
  if (!displayData || displayData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-center">
        <div>
          <div className="text-muted-foreground dark:text-gray-300 mb-2">No sales data available</div>
          <p className="text-sm text-muted-foreground dark:text-gray-300">Record sales or upload CSV data to see charts</p>
        </div>
      </div>
    )
  }
  const axisColor = isDark ? '#94a3b8' : '#6b7280' // slate-400 / gray-500
  const gridStroke = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sales Volume</CardTitle>
          <CardDescription>Monthly sales units over the past year</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              sales: {
                label: "Units Sold",
                color: "hsl(var(--chart-1))",
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="month" tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} />
                <YAxis tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sales" fill="var(--color-chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue Trend</CardTitle>
          <CardDescription>Monthly revenue generated from this product</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              revenue: {
                label: "Revenue ($)",
                color: "hsl(var(--chart-2))",
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="month" tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} />
                <YAxis tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-chart-2)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
