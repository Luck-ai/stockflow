"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TrendingUp, TrendingDown, Package, Calendar, Activity, BarChart3 } from "lucide-react"
import { getBulkSKUForecastsCached, getBulkCategoryForecastsCached, getBulkChannelForecastsCached, clearPredictionsCache } from "@/lib/api"

interface ForecastDataPoint {
  date: string
  predicted_quantity: number
  lower_bound?: number
  upper_bound?: number
}

interface SKUForecast {
  sku_id: string
  sku_name?: string
  category?: string
  forecast_days: number
  mae: number
  mape: string
  forecast: ForecastDataPoint[]
}

interface CategoryForecast {
  category: string
  forecast_days: number
  mae: number
  mape: string
  forecast: ForecastDataPoint[]
}

interface ChannelForecast {
  channel: string
  forecast_days: number
  mae: number
  mape: string
  forecast: ForecastDataPoint[]
}

interface BulkSKUResponse {
  total_skus: number
  forecasts: SKUForecast[]
}

interface BulkCategoryResponse {
  total_categories: number
  forecasts: CategoryForecast[]
}

interface BulkChannelResponse {
  total_channels: number
  forecasts: ChannelForecast[]
}

export function PredictionsView() {
  const [forecastDays, setForecastDays] = useState(84)
  const [skuLimit, setSkuLimit] = useState(20)
  const [categoryLimit, setCategoryLimit] = useState(10)
  const [channelLimit, setChannelLimit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [skuForecasts, setSkuForecasts] = useState<SKUForecast[]>([])
  const [categoryForecasts, setCategoryForecasts] = useState<CategoryForecast[]>([])
  const [channelForecasts, setChannelForecasts] = useState<ChannelForecast[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"skus" | "categories" | "channels">("skus")
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)

  const fetchSKUForecasts = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getBulkSKUForecastsCached(forecastDays, skuLimit)
      console.log('SKU Forecasts data:', data.forecasts[0])
      setSkuForecasts(data.forecasts)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SKU forecasts")
      console.error("Error fetching SKU forecasts:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategoryForecasts = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getBulkCategoryForecastsCached(forecastDays, categoryLimit)
      console.log('Category Forecasts data:', data.forecasts[0])
      setCategoryForecasts(data.forecasts)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load category forecasts")
      console.error("Error fetching category forecasts:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchChannelForecasts = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getBulkChannelForecastsCached(forecastDays, channelLimit)
      console.log('Channel Forecasts data:', data.forecasts[0])
      setChannelForecasts(data.forecasts)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channel forecasts")
      console.error("Error fetching channel forecasts:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === "skus") {
      fetchSKUForecasts()
    } else if (activeTab === "categories") {
      fetchCategoryForecasts()
    } else {
      fetchChannelForecasts()
    }
  }, [activeTab, forecastDays, skuLimit, categoryLimit, channelLimit])

  const getTotalForecast = (forecast: ForecastDataPoint[]) => {
    return forecast.reduce((sum, point) => sum + point.predicted_quantity, 0)
  }

  const getAverageForecast = (forecast: ForecastDataPoint[]) => {
    if (forecast.length === 0) return 0
    return getTotalForecast(forecast) / forecast.length
  }

  const renderForecastChart = (forecast: ForecastDataPoint[], label: string) => {
    const weeklyData: { weekLabel: string, total: number }[] = []
    
    for (let i = 0; i < forecast.length; i += 7) {
      const weekData = forecast.slice(i, i + 7)
      const total = weekData.reduce((sum, d) => sum + d.predicted_quantity, 0)
      
      if (weekData.length > 0) {
        try {
          const startDate = new Date(weekData[0].date)
          const endDate = new Date(weekData[weekData.length - 1].date)
          
          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' })
            const startDay = startDate.getDate()
            const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' })
            const endDay = endDate.getDate()
            const year = startDate.getFullYear()
            
            let weekLabel
            if (startMonth === endMonth) {
              weekLabel = `${startMonth} ${startDay}-${endDay}, ${year}`
            } else {
              weekLabel = `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
            }
            weeklyData.push({ weekLabel, total })
          }
        } catch (e) {
          console.warn('Error parsing date:', weekData[0].date, e)
        }
      }
    }
    
    const maxValue = Math.max(...weeklyData.map(w => w.total))
    
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground mb-4">{label}</div>
        <div className="space-y-3">
          {weeklyData.slice(0, 8).map((week, idx) => {
            const percentage = maxValue > 0 ? (week.total / maxValue) * 100 : 0
            
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{week.weekLabel}</span>
                  <span className="font-medium">{week.total.toLocaleString()} units</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderSKUCard = (forecast: SKUForecast) => {
    const totalPredicted = getTotalForecast(forecast.forecast)
    const avgWeekly = getAverageForecast(forecast.forecast)
    
    return (
      <Card 
        key={forecast.sku_id} 
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => setSelectedSku(selectedSku === forecast.sku_id ? null : forecast.sku_id)}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{forecast.sku_name || forecast.sku_id}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <span className="font-mono text-xs">{forecast.sku_id}</span>
                {forecast.category && (
                  <Badge variant="outline" className="text-xs">
                    {forecast.category}
                  </Badge>
                )}
              </CardDescription>
            </div>
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-blue-600">{totalPredicted.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total {Math.ceil((forecast.forecast_days || 84) / 7)} Weeks</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{avgWeekly.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Avg per Day</div>
            </div>
            <div>
              <div className="text-sm font-bold text-orange-600">MAE: {forecast.mae.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">MAPE: {forecast.mape}</div>
            </div>
          </div>

          {selectedSku === forecast.sku_id && (
            <div className="mt-4 pt-4 border-t">
              {renderForecastChart(forecast.forecast, `${Math.ceil((forecast.forecast_days || 84) / 7)}-Week Forecast`)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderCategoryCard = (forecast: CategoryForecast) => {
    const totalPredicted = getTotalForecast(forecast.forecast)
    const avgWeekly = getAverageForecast(forecast.forecast)
    
    return (
      <Card 
        key={forecast.category} 
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => setSelectedCategory(selectedCategory === forecast.category ? null : forecast.category)}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{forecast.category}</CardTitle>
              <CardDescription>Category Forecast</CardDescription>
            </div>
            <BarChart3 className="h-5 w-5 text-purple-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-blue-600">{totalPredicted.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total {Math.ceil((forecast.forecast_days || 84) / 7)} Weeks</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{avgWeekly.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Avg per Day</div>
            </div>
            <div>
              <div className="text-sm font-bold text-orange-600">MAE: {forecast.mae.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">MAPE: {forecast.mape}</div>
            </div>
          </div>

          {selectedCategory === forecast.category && (
            <div className="mt-4 pt-4 border-t">
              {renderForecastChart(forecast.forecast, `${Math.ceil((forecast.forecast_days || 84) / 7)}-Week Forecast`)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderChannelCard = (forecast: ChannelForecast) => {
    const totalPredicted = getTotalForecast(forecast.forecast)
    const avgWeekly = getAverageForecast(forecast.forecast)
    
    return (
      <Card 
        key={forecast.channel} 
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => setSelectedChannel(selectedChannel === forecast.channel ? null : forecast.channel)}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg capitalize">{forecast.channel}</CardTitle>
              <CardDescription>Channel Forecast</CardDescription>
            </div>
            <Activity className="h-5 w-5 text-green-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-blue-600">{totalPredicted.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total {Math.ceil((forecast.forecast_days || 84) / 7)} Weeks</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{avgWeekly.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Avg per Day</div>
            </div>
            <div>
              <div className="text-sm font-bold text-orange-600">MAE: {forecast.mae.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">MAPE: {forecast.mape}</div>
            </div>
          </div>

          {selectedChannel === forecast.channel && (
            <div className="mt-4 pt-4 border-t">
              {renderForecastChart(forecast.forecast, `${Math.ceil((forecast.forecast_days || 84) / 7)}-Week Forecast`)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Sales Predictions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-powered sales forecasts for inventory planning
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "skus" ? (
            <Select value={skuLimit.toString()} onValueChange={(v) => setSkuLimit(Number(v))}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Top 10 SKUs</SelectItem>
                <SelectItem value="20">Top 20 SKUs</SelectItem>
                <SelectItem value="30">Top 30 SKUs</SelectItem>
                <SelectItem value="50">Top 50 SKUs</SelectItem>
                <SelectItem value="100">Top 100 SKUs</SelectItem>
              </SelectContent>
            </Select>
          ) : activeTab === "categories" ? (
            <Select value={categoryLimit.toString()} onValueChange={(v) => setCategoryLimit(Number(v))}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5 Categories</SelectItem>
                <SelectItem value="10">Top 10 Categories</SelectItem>
                <SelectItem value="15">Top 15 Categories</SelectItem>
                <SelectItem value="20">Top 20 Categories</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select value={channelLimit.toString()} onValueChange={(v) => setChannelLimit(Number(v))}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5 Channels</SelectItem>
                <SelectItem value="10">Top 10 Channels</SelectItem>
                <SelectItem value="15">Top 15 Channels</SelectItem>
                <SelectItem value="20">Top 20 Channels</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={forecastDays.toString()} onValueChange={(v) => setForecastDays(Number(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="28">4 Weeks</SelectItem>
              <SelectItem value="56">8 Weeks</SelectItem>
              <SelectItem value="84">12 Weeks</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              clearPredictionsCache()
              if (activeTab === "skus") {
                fetchSKUForecasts()
              } else if (activeTab === "categories") {
                fetchCategoryForecasts()
              } else {
                fetchChannelForecasts()
              }
            }}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SKU Forecasts</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{skuForecasts.length}</div>
            <p className="text-xs text-muted-foreground">Individual products</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Category Forecasts</CardTitle>
            <BarChart3 className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoryForecasts.length}</div>
            <p className="text-xs text-muted-foreground">Product categories</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Channel Forecasts</CardTitle>
            <Activity className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{channelForecasts.length}</div>
            <p className="text-xs text-muted-foreground">Sales channels</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Forecast Period</CardTitle>
            <Calendar className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.ceil(forecastDays / 7)} Weeks</div>
            <p className="text-xs text-muted-foreground">{forecastDays} days prediction</p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-red-500 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600 font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Forecasts</CardTitle>
          <CardDescription>
            Click on any card to expand and view detailed weekly predictions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "skus" | "categories" | "channels")}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="skus">
                <Package className="h-4 w-4 mr-2" />
                SKUs
              </TabsTrigger>
              <TabsTrigger value="categories">
                <BarChart3 className="h-4 w-4 mr-2" />
                Categories
              </TabsTrigger>
              <TabsTrigger value="channels">
                <Activity className="h-4 w-4 mr-2" />
                Channels
              </TabsTrigger>
            </TabsList>

            <TabsContent value="skus" className="space-y-4 mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Activity className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="ml-3 text-muted-foreground">Loading SKU forecasts...</span>
                </div>
              ) : skuForecasts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No SKU forecasts available.</p>
                  <p className="text-sm mt-1">Try adjusting the forecast period or check if there's sufficient sales data.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {skuForecasts.map(renderSKUCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="categories" className="space-y-4 mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Activity className="h-8 w-8 animate-spin text-purple-600" />
                  <span className="ml-3 text-muted-foreground">Loading category forecasts...</span>
                </div>
              ) : categoryForecasts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No category forecasts available.</p>
                  <p className="text-sm mt-1">Try adjusting the forecast period or check if there's sufficient sales data.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categoryForecasts.map(renderCategoryCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="channels" className="space-y-4 mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Activity className="h-8 w-8 animate-spin text-green-600" />
                  <span className="ml-3 text-muted-foreground">Loading channel forecasts...</span>
                </div>
              ) : channelForecasts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No channel forecasts available.</p>
                  <p className="text-sm mt-1">Try adjusting the forecast period or check if there's sufficient sales data.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {channelForecasts.map(renderChannelCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
