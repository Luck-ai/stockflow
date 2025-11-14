"use client"

import React, { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, ComposedChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface SalesByCategoryChartProps {
  categoryGranularity: 'monthly' | 'weekly'
  selectedCategoryForGraph: string
  categoryChartData: {
    series: any[]
    filteredSeries: any[]
    xKey: string
    totalSales: number
  } | null
  categoryColors: string[]
  categoryKeysForGraph: string[]
  onCategoryChange: (value: string) => void
  onGranularityChange: (value: 'monthly' | 'weekly') => void
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !Array.isArray(payload)) return null
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3">
      <div className="font-semibold mb-2">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.stroke || p.fill }} />
            <span>{p.name || p.dataKey}</span>
          </div>
          <span className="font-medium">{Number(p.value || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export const SalesByCategoryChart = React.memo(({ 
  categoryGranularity,
  selectedCategoryForGraph,
  categoryChartData,
  categoryColors,
  categoryKeysForGraph,
  onCategoryChange,
  onGranularityChange
}: SalesByCategoryChartProps) => {
  const categoryBars = useMemo(() => {
    return categoryKeysForGraph.map((cat: string, idx: number) => ({
      key: `category-${cat}-${idx}`,
      dataKey: cat,
      fill: categoryColors[idx % categoryColors.length]
    }))
  }, [categoryKeysForGraph, categoryColors])

  if (!categoryChartData) {
    return <div className="p-4 text-sm text-muted-foreground">No category sales data available.</div>
  }

  return (
    <div>
      <div className="w-full flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <select 
            value={categoryGranularity} 
            onChange={(e) => onGranularityChange(e.target.value as 'monthly' | 'weekly')} 
            className="px-2 py-1 rounded border bg-card text-card-foreground text-sm"
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
          <Select value={selectedCategoryForGraph} onValueChange={onCategoryChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoryKeysForGraph.map((cat: string) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-4 p-3 bg-muted/50 rounded-lg">
        <div className="text-sm text-muted-foreground">Total Sales</div>
        <div className="text-2xl font-bold">{categoryChartData.totalSales.toLocaleString()} units</div>
      </div>

      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer>
          {selectedCategoryForGraph === 'all' ? (
            <BarChart data={categoryChartData.series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={categoryChartData.xKey} tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              {categoryBars.map(({ key, dataKey, fill }) => (
                <Bar key={key} dataKey={dataKey} stackId="a" fill={fill} isAnimationActive={false} />
              ))}
            </BarChart>
          ) : (
            <ComposedChart data={categoryChartData.filteredSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={categoryChartData.xKey} tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey={selectedCategoryForGraph} 
                stroke="#3b82f6" 
                strokeWidth={2} 
                dot={{ r: 3 }}
                isAnimationActive={true}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}, (prev, next) => {
  return prev.categoryGranularity === next.categoryGranularity &&
    prev.selectedCategoryForGraph === next.selectedCategoryForGraph &&
    prev.categoryChartData === next.categoryChartData &&
    prev.categoryKeysForGraph === next.categoryKeysForGraph
})

SalesByCategoryChart.displayName = 'SalesByCategoryChart'
