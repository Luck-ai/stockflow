"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Target, Clock, DollarSign } from "lucide-react"

interface InventoryMetricsCardsProps {
  stockHealthPercentage: number
  stockHealthScore: number
  healthyStock: number
  totalProducts: number
  avgDaysUntilStockout: number
  totalUnitsSold: number
}

export const InventoryMetricsCards = React.memo(({ 
  stockHealthPercentage,
  stockHealthScore,
  healthyStock,
  totalProducts,
  avgDaysUntilStockout,
  totalUnitsSold
}: InventoryMetricsCardsProps) => {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Stock Health Score</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            stockHealthScore >= 80 ? 'text-green-600' :
            stockHealthScore >= 60 ? 'text-blue-600' :
            stockHealthScore >= 40 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {stockHealthScore.toFixed(1)}/100
          </div>
          <Progress value={stockHealthScore} className="mt-2" />
          <p className="text-xs text-muted-foreground mt-1">
            Multi-factor health assessment
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Days Until Stockout</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            avgDaysUntilStockout < 14 ? 'text-red-600' :
            avgDaysUntilStockout < 30 ? 'text-orange-600' : 'text-green-600'
          }`}>
            {avgDaysUntilStockout.toFixed(0)} days
          </div>
          <p className="text-xs text-muted-foreground">
            Weighted by sales velocity
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-700">
            {typeof totalUnitsSold === 'number' ? totalUnitsSold.toLocaleString() : '—'} units
          </div>
          <p className="text-xs text-muted-foreground">
            Total units sold: {typeof totalUnitsSold === 'number' ? totalUnitsSold.toLocaleString() : '—'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
})

InventoryMetricsCards.displayName = 'InventoryMetricsCards'
