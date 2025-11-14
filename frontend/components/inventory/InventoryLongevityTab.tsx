"use client"

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { BarChart3 } from "lucide-react"

interface LongevitySegment {
  label: string
  count: number
  color: string
}

interface InventoryLongevityTabProps {
  longevityDistribution: LongevitySegment[]
  totalProducts: number
}

export const InventoryLongevityTab = React.memo(({ 
  longevityDistribution,
  totalProducts
}: InventoryLongevityTabProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Inventory Duration Distribution
        </CardTitle>
        <CardDescription>
          How long current stock levels will last based on sales velocity
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {longevityDistribution.map((segment) => (
            <div key={segment.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="font-medium">{segment.label}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold">{segment.count} SKUs</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    ({totalProducts > 0 ? ((segment.count / totalProducts) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              </div>
              <Progress 
                value={totalProducts > 0 ? (segment.count / totalProducts) * 100 : 0}
                className="h-2"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})

InventoryLongevityTab.displayName = 'InventoryLongevityTab'
