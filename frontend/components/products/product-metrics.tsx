"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, TrendingDown, Target, Clock } from "lucide-react"

interface ProductMetricsProps {
  productId: string
}

export function ProductMetrics({ productId }: ProductMetricsProps) {
  // Metrics placeholders — replace with real analytics when backend endpoints are available
  const metrics = {
    salesVelocity: undefined as number | undefined,
    turnoverRate: undefined as number | undefined,
    profitMargin: undefined as number | undefined,
    customerSatisfaction: undefined as number | undefined,
    returnRate: undefined as number | undefined,
    stockAccuracy: undefined as number | undefined,
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Sales Velocity</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.salesVelocity ?? '—'}</div>
          <p className="text-xs text-muted-foreground">units per week</p>
          <div className="mt-2">
            <Progress value={75} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Inventory Turnover</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.turnoverRate ? `${metrics.turnoverRate}x` : '—'}</div>
          <p className="text-xs text-muted-foreground">times per year</p>
          <div className="mt-2">
            <Progress value={85} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.profitMargin ? `${metrics.profitMargin}%` : '—'}</div>
          <p className="text-xs text-muted-foreground">gross margin</p>
          <div className="mt-2">
            <Progress value={metrics.profitMargin} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Customer Rating</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.customerSatisfaction ? `${metrics.customerSatisfaction}/5` : '—'}</div>
          <p className="text-xs text-muted-foreground">average rating</p>
          <div className="mt-2">
            <Progress value={metrics.customerSatisfaction ? (metrics.customerSatisfaction / 5) * 100 : 0} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Return Rate</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.returnRate ? `${metrics.returnRate}%` : '—'}</div>
          <p className="text-xs text-muted-foreground">of total sales</p>
          <div className="mt-2">
            <Progress value={metrics.returnRate ? 100 - metrics.returnRate : 0} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Stock Accuracy</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.stockAccuracy ? `${metrics.stockAccuracy}%` : '—'}</div>
          <p className="text-xs text-muted-foreground">inventory accuracy</p>
          <div className="mt-2">
            <Progress value={metrics.stockAccuracy} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
