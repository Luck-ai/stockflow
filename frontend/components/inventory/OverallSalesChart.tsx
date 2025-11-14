"use client"

import React, { useMemo } from 'react'
import { ResponsiveContainer, ComposedChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'

interface OverallSalesChartProps {
  chartGranularity: 'monthly' | 'weekly'
  monthlySalesSeries: { month: string; units: number }[]
  weeklySeries: any[]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload[0]) return null
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3">
      <div className="font-semibold mb-1">{payload[0].payload.month || payload[0].payload.period}</div>
      <div className="text-sm">
        <span className="font-medium">{payload[0].value?.toLocaleString()}</span>
        <span className="text-muted-foreground ml-1">units</span>
      </div>
    </div>
  )
}

export const OverallSalesChart = React.memo(({ 
  chartGranularity,
  monthlySalesSeries,
  weeklySeries
}: OverallSalesChartProps) => {
  const { series, xKey } = useMemo(() => {
    if (chartGranularity === 'monthly') {
      return {
        series: monthlySalesSeries,
        xKey: 'month'
      }
    }
    return {
      series: weeklySeries.map(w => ({ period: w.period, units: w.total })),
      xKey: 'period'
    }
  }, [chartGranularity, monthlySalesSeries, weeklySeries])
  
  if (!series || series.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No sales series available yet.</div>
  }
  
  return (
    <div style={{ width: '100%', height: 420 }}>
      <ResponsiveContainer>
        <ComposedChart data={series}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="units" 
            stroke="#3b82f6" 
            strokeWidth={2} 
            dot={{ r: 3 }}
            isAnimationActive={true}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}, (prev, next) => {
  return prev.chartGranularity === next.chartGranularity &&
    prev.monthlySalesSeries === next.monthlySalesSeries &&
    prev.weeklySeries === next.weeklySeries
})

OverallSalesChart.displayName = 'OverallSalesChart'
