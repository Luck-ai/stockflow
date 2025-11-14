"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

import { Package } from "lucide-react"
import { getProductsCached as getProducts, getCategoriesCached as getCategories, getAllSalesCached, analyzeSalesData, getTopSkusCached, getTopCategoriesCached, getOutOfStockProductsCached, getLowStockProductsCached, getDeadStockCached, getActiveStockCached, getSalesTimeSeries, getSalesByChannel, getSalesByCategory, clearApiCache } from '@/lib/api'
import { Product } from '@/components/stock/stock-management'

import { InventoryMetricsCards } from './InventoryMetricsCards'
import { InventoryLongevityTab } from './InventoryLongevityTab'
import { CategoryBreakdownTab } from './CategoryBreakdownTab'
import { TopPerformersTab } from './TopPerformersTab'
import { OverallSalesChart } from './OverallSalesChart'
import { SalesByChannelChart } from './SalesByChannelChart'
import { SalesByCategoryChart } from './SalesByCategoryChart'

export function InventorySummary() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("30d")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [chartGranularity, setChartGranularity] = useState<'monthly' | 'weekly'>('monthly')
  const [salesView, setSalesView] = useState<'by-channel' | 'overall'>('by-channel')
  const [salesData, setSalesData] = useState<Map<string, any>>(new Map())
  const [salesDataVersion, setSalesDataVersion] = useState(0)
  const [loadingSales, setLoadingSales] = useState(false)
  const [allSales, setAllSales] = useState<any[]>([])
  const [topCategories, setTopCategories] = useState<any[] | null>(null)
  const [topSkus, setTopSkus] = useState<any[] | null>(null)
  const [topSkusLimit, setTopSkusLimit] = useState<number>(10)
  // Minimum units selector (controlled by the CategoryBreakdownTab UI)
  // Default to 1000 for the 'all categories' view to improve performance
  const [categoryUnitFilter, setCategoryUnitFilter] = useState<number>(1000)
  const [selectedChannel, setSelectedChannel] = useState<string>('all')
  const [selectedCategoryForGraph, setSelectedCategoryForGraph] = useState<string>('all')
  const [channelGranularity, setChannelGranularity] = useState<'monthly' | 'weekly'>('monthly')
  const [categoryGranularity, setCategoryGranularity] = useState<'monthly' | 'weekly'>('monthly')
  const [activeTab, setActiveTab] = useState<string>('longevity')
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['longevity']))
  const [renderCharts, setRenderCharts] = useState<{ overall: boolean, channel: boolean, category: boolean }>({ overall: false, channel: false, category: false })
  // Backend-driven BI counts
  const [countsLoading, setCountsLoading] = useState(false)
  const [outOfStockCountDb, setOutOfStockCountDb] = useState<number | null>(null)
  const [activeStockCountDb, setActiveStockCountDb] = useState<number | null>(null)
  const [lowStockCountDb, setLowStockCountDb] = useState<number | null>(null)
  const [slowMovingCountDb, setSlowMovingCountDb] = useState<number | null>(null)

  // Backend-aggregated time series data (replaces client-side aggregations)
  const [monthlySeriesDb, setMonthlySeriesDb] = useState<any[]>([])
  const [weeklySeriesDb, setWeeklySeriesDb] = useState<any[]>([])
  const [channelDataDb, setChannelDataDb] = useState<{ channels: string[], monthly: any[], weekly: any[] }>({ channels: [], monthly: [], weekly: [] })
  const [categoryDataDb, setCategoryDataDb] = useState<{ categories: string[], monthly: any[], weekly: any[] }>({ categories: [], monthly: [], weekly: [] })
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [loadingChannelData, setLoadingChannelData] = useState(false)
  const [loadingCategoryData, setLoadingCategoryData] = useState(false)
  const [salesWindowDays, setSalesWindowDays] = useState<number | undefined>(undefined)

  // Note: app uses backend-only data; no local/demo data sources.

  // Defer mounting the category chart to prioritize the category list and controls
  // Previously we deferred mounting the category chart to prioritize list/controls.
  // That deferred mount has been removed so the category chart can render independently
  // and does not depend on other charts. Use loadingCategoryData/categoryChartData to
  // show a loading state as required.

  // Load data: fetch products/categories first for faster initial render; analyze sales in background
  useEffect(() => {
    // Clear any old product cache to ensure we fetch with the correct salesWindowDays
    clearApiCache('products:{}:sw:')
    
    // Read salesWindowDays from localStorage (set by Stock Management page)
    let windowDays: number = 180 // Default to 180 days
    console.log('[InventorySummary] Initial windowDays:', windowDays)
    
    try {
      const saved = localStorage.getItem('salesWindowDays')
      console.log('[InventorySummary] Retrieved from localStorage:', saved)
      if (saved && saved !== '') {
        const val = Number(saved)
        console.log('[InventorySummary] Parsed value:', val, 'isNaN:', isNaN(val))
        if (!isNaN(val) && val > 0) {
          windowDays = val
          console.log('[InventorySummary] Updated windowDays to:', windowDays)
        }
      }
    } catch (e) {
      console.warn('Failed to read salesWindowDays from localStorage', e)
    }
    
    console.log('[InventorySummary] Final windowDays before loadData:', windowDays)
    // Set the state for display
    setSalesWindowDays(windowDays)
    
    const loadData = async () => {
      try {
        setLoading(true)

        console.log('[InventorySummary] About to call getProducts with windowDays:', windowDays)
        const [productsData, categoriesData] = await Promise.all([
          getProducts({}, windowDays),
          getCategories()
        ])
        
        // Normalize categories to a simple list of names
        const validCategories = (categoriesData || []).map((c: any, idx: number) => {
          if (!c) return `Category ${idx}`
          if (typeof c === 'string') return c
          if (c.name) return c.name
          return String(c)
        }).filter(Boolean)
        
        // Enhance products with calculated metrics
        const enhancedProducts = productsData.map(p => {
          const product = p as any // Type assertion to access optional properties

          // Use backend-provided daily_sales_rate only (no fallbacks)
          const sku = p.sku || String(p.id || '')

          // Deterministic metrics (no random/mocked values)
          let dailySalesRate = 0
          let daysUntilStockout = 999
          let salesTrend: 'increasing' | 'stable' | 'decreasing' = 'stable'
          let daysSinceLastSale = 999

          // Prefer the authoritative backend field `daily_sales_rate` when present.
          // Do NOT fall back to client-side sales analysis or other product fields.
          if (typeof (product as any).daily_sales_rate === 'number') {
            dailySalesRate = Number((product as any).daily_sales_rate) || 0
            daysSinceLastSale = (product as any).days_since_last_sale || 999
          } else {
            // No backend rate available: keep defaults (rate = 0, daysUntilStockout = large sentinel)
            dailySalesRate = 0
            daysSinceLastSale = (product as any).days_since_last_sale || 999
          }

          const stockLevel = p.stock_level || p.quantity || 0
          daysUntilStockout = dailySalesRate > 0 ? Math.floor(stockLevel / dailySalesRate) : 999

          if (daysSinceLastSale <= 7) salesTrend = 'increasing'
          else if (daysSinceLastSale <= 30) salesTrend = 'stable'
          else salesTrend = 'decreasing'
          
          const leadTime = (typeof product.lead_time_days === 'number') ? product.lead_time_days : 14
          const baselineSafety = p.low_stock_threshold || 0
          // Reorder point = baseline safety stock + expected consumption during lead time
          const reorderPoint = Math.ceil(baselineSafety + (leadTime * dailySalesRate))
          
          const isSlowMoving = daysSinceLastSale > 60
          const isDeadStock = daysSinceLastSale > 90

          // Calculate total sales volume deterministically (no random values)
          const monthlySales = product.monthly_sales || Math.floor(dailySalesRate * 30)

          return {
            ...p,
            quantity: stockLevel, // Normalize quantity field
            daily_sales_rate: dailySalesRate,
            days_until_stockout: daysUntilStockout,
            reorder_point: reorderPoint,
            sales_trend: salesTrend,
            lead_time_days: leadTime,
            monthly_sales: monthlySales,
            // total_sales_value removed: no price/monetary calculations in UI
            days_since_last_sale: daysSinceLastSale,
            is_slow_moving: isSlowMoving,
            is_dead_stock: isDeadStock
          } as Product & {
            days_since_last_sale: number,
            is_slow_moving: boolean,
            is_dead_stock: boolean
          }
        })
        
        setProducts(enhancedProducts)
        setCategories(validCategories)

        // Fetch sales in background to avoid blocking initial render
        ;(async () => {
          try {
            setLoadingSales(true)
            const sales = await getAllSalesCached()
            // store the raw array for robust time-series aggregation
            setAllSales(Array.isArray(sales) ? sales : [])
            const salesGrouped: { [sku: string]: any[] } = {}
            for (const sale of sales) {
              if (!salesGrouped[sale.sku]) salesGrouped[sale.sku] = []
              salesGrouped[sale.sku].push(sale)
            }
            const currentSalesData = new Map<string, any>()
            for (const [sku, productSales] of Object.entries(salesGrouped)) {
              const analysis = analyzeSalesData(productSales)
              // Store both the summary analysis and the raw sales array so other UI can
              // build time-series charts without losing the detailed records.
              currentSalesData.set(sku, { analysis, rawSales: productSales })
            }
            setSalesData(currentSalesData)
            setSalesDataVersion(prev => prev + 1)
            // Also fetch top categories and top skus in background
              try {
              const [cats, skus] = await Promise.allSettled([getTopCategoriesCached(10), getTopSkusCached(topSkusLimit)])
              if (cats.status === 'fulfilled') {
                const rawCats = Array.isArray(cats.value) ? cats.value : null
                if (rawCats) {
                  // Use backend-provided product_count only. Do NOT compute counts on the frontend.
                  const normalized = rawCats.map((c: any) => ({
                    ...c,
                    product_count: Number(c.product_count ?? c.productCount ?? 0)
                  }))
                  setTopCategories(normalized)
                } else {
                  setTopCategories(null)
                }
              }
              if (skus.status === 'fulfilled') setTopSkus(Array.isArray(skus.value) ? skus.value : null)
            } catch (e) {
              console.warn('Failed to fetch top categories/skus:', e)
            }
          } catch (error) {
            console.error('Failed to load sales data in background:', error)
          } finally {
            setLoadingSales(false)
          }
        })().catch(() => {})
      } catch (error) {
        console.error('Failed to load inventory data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, []) // dataSource removed: app uses backend-only data


  // Refetch top SKUs when limit changes
  useEffect(() => {
    const fetchTopSkus = async () => {
      try {
        const skus = await getTopSkusCached(topSkusLimit)
        setTopSkus(Array.isArray(skus) ? skus : null)
      } catch (e) {
        console.warn('Failed to fetch top skus:', e)
      }
    }
    
    if (topSkusLimit > 0) {
      fetchTopSkus()
    }
  }, [topSkusLimit])

  // Filter products by category name
  const filteredProducts = useMemo(() => {
    if (selectedCategory === "all") return products
    return products.filter(p => {
      const cat = (p as any).category
      const name = typeof cat === 'string' ? cat : (cat && (cat.name || cat))
      return String(name) === selectedCategory
    })
  }, [products, selectedCategory])

  // Calculate summary metrics
  const metrics = useMemo(() => {
  const totalProducts = filteredProducts.length
  const totalQuantity = filteredProducts.reduce((sum, p) => sum + (p.quantity || 0), 0)
  const avgMonthlySales = filteredProducts.length > 0 ? filteredProducts.reduce((sum, p) => sum + ((p as any).monthly_sales || 0), 0) / filteredProducts.length : 0
    
  // Compute total units sold: prefer aggregated salesData (all sales), else fall back to backend topSkus totals, else products
  let totalUnitsSold = 0
  if (salesData && salesData.size > 0) {
    for (const v of salesData.values()) {
      // v may now be { analysis, rawSales }
      const analysis = v && v.analysis ? v.analysis : v
      totalUnitsSold += Number(analysis?.totalSales || 0)
    }
  } else if (topSkus && Array.isArray(topSkus) && topSkus.length > 0) {
    totalUnitsSold = topSkus.reduce((sum: number, it: any) => sum + (Number(it.total_quantity || 0)), 0)
  } else {
    // fallback to product monthly_sales value
    totalUnitsSold = filteredProducts.reduce((sum, p) => sum + ((p as any).monthly_sales || 0), 0)
  }

  // Use backend-driven counts where possible (fall back to client-side computed values)
  const outOfStock = typeof outOfStockCountDb === 'number' ? outOfStockCountDb : filteredProducts.filter(p => (p.quantity || 0) === 0).length
  const lowStock = typeof lowStockCountDb === 'number' ? lowStockCountDb : filteredProducts.filter(p => (p.quantity || 0) > 0 && (p.quantity || 0) <= (p.low_stock_threshold || 0)).length
  const needReorder = filteredProducts.filter(p => (p.quantity || 0) <= (p.reorder_point || 0)).length
  const urgentReorders = filteredProducts.filter(p => (p.days_until_stockout || 999) < 7).length
    
  // Inventory longevity breakdown
  // Calculate days until stockout for each product based on backend daily_sales_rate
  let noSalesCount = 0
  let within14Days = 0
  let within30Days = 0
  let within6Months = 0
  let within1Year = 0
  let over1Year = 0

  filteredProducts.forEach(p => {
    const currentStock = p.quantity || 0
    
    // Use backend-provided daily_sales_rate (already calculated based on salesWindowDays)
    const dailySalesRate = p.daily_sales_rate || 0
    
    // If no sales velocity, count as "No sales"
    if (dailySalesRate <= 0) {
      noSalesCount++
      return
    }
    
    // If out of stock but has sales velocity, count as critical (≤14 days)
    if (currentStock === 0) {
      within14Days++
      return
    }
    
    // Calculate days until stockout using backend daily sales rate
    const daysUntilStockout = Math.round(currentStock / dailySalesRate)
    
    if (daysUntilStockout <= 14) {
      within14Days++
    } else if (daysUntilStockout <= 30) {
      within30Days++
    } else if (daysUntilStockout <= 180) {
      within6Months++
    } else if (daysUntilStockout <= 365) {
      within1Year++
    } else {
      over1Year++
    }
  })
    
    // Slow moving and dead stock analysis
  const slowMovingStock = typeof slowMovingCountDb === 'number' ? slowMovingCountDb : filteredProducts.filter(p => (p as any).is_slow_moving).length
  const deadStock = filteredProducts.filter(p => (p as any).is_dead_stock).length
  const activeStock = typeof activeStockCountDb === 'number' ? activeStockCountDb : filteredProducts.filter(p => ((p as any).days_since_last_sale || 999) <= 30).length
    
    // Option 1: Weighted Average Days Until Stockout
    // Weight by sales velocity so high-volume products have more impact
    const avgDaysUntilStockout = (() => {
      let totalWeightedDays = 0
      let totalWeight = 0
      
      filteredProducts.forEach(p => {
        const dailyRate = p.daily_sales_rate || 0
        const daysLeft = p.days_until_stockout || 0
        
        // Skip products with no sales or invalid data
        if (dailyRate <= 0 || daysLeft >= 999) return
        
        // Weight by daily sales rate (higher velocity = more important)
        totalWeightedDays += daysLeft * dailyRate
        totalWeight += dailyRate
      })
      
      return totalWeight > 0 ? totalWeightedDays / totalWeight : 0
    })()
    
    const avgSalesVelocity = filteredProducts.length > 0 ?
      filteredProducts.reduce((sum, p) => sum + (p.daily_sales_rate || 0), 0) / filteredProducts.length : 0
    
    // Category breakdown: prefer backend-driven top categories when available (units-based)
    let categoryBreakdown = [] as any[]
    if (topCategories && Array.isArray(topCategories) && topCategories.length > 0) {
      // Map backend top categories into the shape expected by the UI
      categoryBreakdown = topCategories.map((c: any, idx: number) => {
        const name = c.category || 'Unknown'
        // Attempt to find matching products to compute counts/values locally as a fallback
        const catProducts = filteredProducts.filter(p => {
          const pc = (p as any).category
          const pname = typeof pc === 'string' ? pc : (pc && (pc.name || pc))
          return String(pname) === String(name)
        })
        const catQuantity = catProducts.reduce((sum, p) => sum + (p.quantity || 0), 0)
        return {
          name,
          count: catProducts.length,
          quantity: catQuantity,
          percentage: totalUnitsSold > 0 ? (catQuantity / totalUnitsSold) * 100 : 0,
          total_quantity: c.total_quantity || 0
        }
      })
    } else {
      categoryBreakdown = categories
        .filter(Boolean)
        .map(catName => {
          const catProducts = filteredProducts.filter(p => {
            const c = (p as any).category
            const name = typeof c === 'string' ? c : (c && (c.name || c))
            return String(name) === String(catName)
          })
          const catQuantity = catProducts.reduce((sum, p) => sum + (p.quantity || 0), 0)
          return {
            name: String(catName) || 'Unknown Category',
            count: catProducts.length,
            quantity: catQuantity,
            percentage: totalUnitsSold > 0 ? (catQuantity / totalUnitsSold) * 100 : 0
          }
    }).filter(cat => cat.count > 0).sort((a, b) => b.quantity - a.quantity)
    }

    // Option 3: Multi-Factor Health Score
    // Calculate a comprehensive health score based on multiple factors (0-100 scale)
    const stockHealthScore = (() => {
      if (filteredProducts.length === 0) return 0
      
      let totalScore = 0
      
      filteredProducts.forEach(p => {
        let score = 0
        const stockLevel = p.quantity || 0
        const reorderPoint = p.reorder_point || 0
        const daysLeft = p.days_until_stockout || 0
        const dailyRate = p.daily_sales_rate || 0
        
        // Factor 1: Stock Coverage (40 points)
        if (daysLeft >= 90) score += 40
        else if (daysLeft >= 60) score += 30
        else if (daysLeft >= 30) score += 20
        else if (daysLeft >= 14) score += 10
        else score += 0
        
        // Factor 2: Stock vs Reorder Point (30 points)
        if (stockLevel >= reorderPoint * 2) score += 30
        else if (stockLevel >= reorderPoint * 1.5) score += 20
        else if (stockLevel > reorderPoint) score += 10
        else score += 0
        
        // Factor 3: Sales Activity (20 points)
        if (dailyRate > 0) {
          const daysSinceSale = (p as any).days_since_last_sale || 999
          if (daysSinceSale <= 7) score += 20
          else if (daysSinceSale <= 30) score += 15
          else if (daysSinceSale <= 60) score += 10
          else if (daysSinceSale <= 90) score += 5
        }
        
        // Factor 4: Not Overstocked (10 points)
        if (daysLeft <= 365) score += 10
        else if (daysLeft <= 500) score += 5
        
        totalScore += score
      })
      
      return (totalScore / filteredProducts.length) // Average score out of 100
    })()

    // Stock health - legacy calculation for backward compatibility
    const healthyStock = filteredProducts.filter(p => 
      (p.quantity || 0) > (p.reorder_point || 0) && (p.days_until_stockout || 0) > 30 && !(p as any).is_slow_moving
    ).length
    
    // Top performers: prefer backend top SKUs, map to local product records when possible
    let topPerformers: any[] = []
    if (topSkus && Array.isArray(topSkus) && topSkus.length > 0) {
      topPerformers = topSkus.map((s: any) => {
        const sku = s.sku || s.raw_id || ''
        const prod = filteredProducts.find(p => (p.sku || String(p.id)) === sku)
        return prod ? ({ ...prod, total_quantity: s.total_quantity || 0 }) : ({ sku, name: sku, total_quantity: s.total_quantity || 0 })
      }).slice(0, 5)
    } else {
      topPerformers = [...filteredProducts]
        .filter(p => ((p as any).days_since_last_sale || 999) < 30) // Only include recently selling items
        .sort((a, b) => (b.daily_sales_rate || 0) - (a.daily_sales_rate || 0))
        .slice(0, 5)
    }

    // Inventory longevity distribution for chart
    const longevityDistribution = [
      { label: 'No sales', count: noSalesCount, color: '#9ca3af' },
      { label: '≤14 days', count: within14Days, color: '#ef4444' },
      { label: '15-30 days', count: within30Days, color: '#f97316' },
      { label: '1-6 months', count: within6Months, color: '#eab308' },
      { label: '6-12 months', count: within1Year, color: '#22c55e' },
      { label: '1+ years', count: over1Year, color: '#3b82f6' }
    ]

    // totalSalesValueEstimate and any currency/price-based estimates removed

    return {
      totalProducts,
      avgMonthlySales,
      totalQuantity,
      totalUnitsSold,
      outOfStock,
      lowStock,
      urgentReorders,
      needReorder,
      healthyStock,
      slowMovingStock,
      deadStock,
      activeStock,
      avgDaysUntilStockout,
      avgSalesVelocity,
      categoryBreakdown,
      topPerformers,
      longevityDistribution,
      stockHealthPercentage: totalProducts > 0 ? (healthyStock / totalProducts) * 100 : 0,
      stockHealthScore,
      salesTurnoverRate: totalQuantity > 0 ? (avgSalesVelocity * 365) / totalQuantity : 0
    }
  // Include salesData so totals update when background sales load completes
  }, [filteredProducts, categories, salesData, salesDataVersion])

  const monthlySalesSeries = useMemo(() => {
    return monthlySeriesDb.map(d => ({ month: d.period, units: d.total }))
  }, [monthlySeriesDb])

  // Shared channel color map and canonicalizer (component scope)
  const channelHex: Record<string, string> = {
    'Shopee': '#fb923c',
    'Facebook': '#3b82f6',
    'TikTok': '#ec4899',
    'TIKTOK': '#ec4899',
    'Instagram': '#8b5cf6',
    'Lazada': '#6366f1',
    'LINE': '#10b981',
    'Website': '#374151',
    'Store': '#f59e0b',
    'unknown': '#9ca3af'
  }

  const categoryColors = ['#3b82f6', '#f97316', '#ec4899', '#8b5cf6', '#10b981', '#6366f1', '#f59e0b', '#14b8a6', '#ef4444', '#a855f7']

  const getCanonicalChannelName = (channel: string | undefined | null) => {
    const raw = (channel ?? 'unknown').toString().trim()
    const normalized = raw.toLowerCase().replace(/[^a-z]/g, '')
    const keys = Object.keys(channelHex)
    // Try exact normalized match first
    let match = keys.find(key => key.toLowerCase().replace(/[^a-z]/g, '') === normalized)
    if (match) return match
    // Try substring match so labels like 'Shopee - PAJARA OFFICIAL' map to 'Shopee'
    match = keys.find(key => {
      const k = key.toLowerCase().replace(/[^a-z]/g, '')
      return normalized.includes(k) || k.includes(normalized)
    })
    if (match) return match
    return raw === '' ? 'unknown' : raw
  }

  // Create product lookup map once for O(1) access
  const productMap = useMemo(() => {
    const map = new Map<string, any>()
    products.forEach(p => {
      const key = p.sku || String(p.id)
      if (key) map.set(key, p)
    })
    return map
  }, [products])

  const businessTrends = useMemo(() => {
    const monthlyChannelSeries = channelDataDb.monthly || []
    const channelKeys: string[] = channelDataDb.channels || []
    
    const monthlyCategorySeries = categoryDataDb.monthly || []
    const categoryKeysForGraph: string[] = categoryDataDb.categories || []

    let monthlyGrowth = 0
    let monthlyGrowthOverall: number | typeof Infinity = 0
    if (Array.isArray(monthlySalesSeries) && monthlySalesSeries.length >= 2) {
      const last = monthlySalesSeries[monthlySalesSeries.length - 1].units || 0
      const prev = monthlySalesSeries[monthlySalesSeries.length - 2].units || 0
      if (prev === 0) monthlyGrowth = last === 0 ? 0 : Infinity
      else monthlyGrowth = ((last - prev) / prev) * 100

      const first = monthlySalesSeries[0].units || 0
      const n = monthlySalesSeries.length
      if (first > 0) {
        monthlyGrowthOverall = (Math.pow(last / first, 1 / (n - 1)) - 1) * 100
      } else {
        const perPair: number[] = []
        let anyInfinite = false
        for (let i = 1; i < monthlySalesSeries.length; i++) {
          const a = monthlySalesSeries[i - 1].units || 0
          const b = monthlySalesSeries[i].units || 0
          if (a === 0) {
            if (b === 0) {
              perPair.push(0)
            } else {
              anyInfinite = true
            }
          } else {
            perPair.push(((b - a) / a) * 100)
          }
        }
        if (perPair.length > 0) {
          monthlyGrowthOverall = perPair.reduce((s, v) => s + v, 0) / perPair.length
        } else {
          monthlyGrowthOverall = anyInfinite ? Infinity : (last === 0 ? 0 : Infinity)
        }
      }
    }

    return {
      monthlyGrowth,
      monthlyGrowthOverall,
      monthlyChannelSeries,
      channelKeys,
      monthlyCategorySeries,
      categoryKeysForGraph
    }
  }, [monthlySalesSeries, channelDataDb, categoryDataDb])

  const weeklyData = useMemo(() => {
    const channelSeries = channelDataDb.weekly || []
    const categorySeries = categoryDataDb.weekly || []
    
    return { channelSeries, categorySeries }
  }, [channelDataDb, categoryDataDb])

  const weeklySeries = weeklyData.channelSeries
  const weeklyCh = weeklyData.channelSeries
  const weeklyCat = weeklyData.categorySeries

  // Memoize getCurrentSeries to avoid recalculation
  const getCurrentSeries = useCallback(() => {
    if (chartGranularity === 'monthly') {
      if (salesView === 'by-channel') return businessTrends.monthlyChannelSeries
      return monthlySalesSeries.map(m => ({ month: m.month, units: m.units }))
    }
    if (salesView === 'by-channel') return weeklySeries
    return weeklySeries.map(w => ({ period: w.period, units: w.total }))
  }, [chartGranularity, salesView, businessTrends.monthlyChannelSeries, monthlySalesSeries, weeklySeries])

  // Memoize total period sales calculation
  const totalPeriodSales = useMemo(() => {
    const series = chartGranularity === 'monthly' 
      ? monthlySalesSeries 
      : weeklySeries.map(w => ({ units: w.total }))
    if (!series || series.length === 0) return 0
    return series.reduce((sum: number, d: any) => sum + (Number(d.units ?? 0)), 0)
  }, [chartGranularity, monthlySalesSeries, weeklySeries])

  // Memoize monthly growth display
  const monthlyGrowthDisplay = useMemo(() => {
    const v = businessTrends.monthlyGrowthOverall
    if (v === Infinity) return '\u221e'
    if (typeof v !== 'number' || Number.isNaN(v)) return '0%'
    return `${v ? v.toFixed(1) : 0}%`
  }, [businessTrends.monthlyGrowthOverall])

  // Memoize channel chart data
  const channelChartData = useMemo(() => {
    const series = channelGranularity === 'monthly' ? businessTrends.monthlyChannelSeries : weeklyCh
    if (!series || series.length === 0) return null
    
    const xKey = channelGranularity === 'monthly' ? 'month' : 'period'
    const filteredSeries = selectedChannel === 'all' 
      ? series 
      : series.map(s => ({
          [xKey]: s[xKey],
          [selectedChannel]: s[selectedChannel] || 0
        }))

    const totalSales = selectedChannel === 'all'
      ? series.reduce((sum, s) => sum + (s.total || 0), 0)
      : series.reduce((sum, s) => sum + (s[selectedChannel] || 0), 0)

    return { series, filteredSeries, xKey, totalSales }
  }, [channelGranularity, businessTrends.monthlyChannelSeries, weeklyCh, selectedChannel])

  // Memoize category chart data
  const categoryChartData = useMemo(() => {
    const series = categoryGranularity === 'monthly' ? businessTrends.monthlyCategorySeries : weeklyCat
    if (!series || series.length === 0) return null
    
    const xKey = categoryGranularity === 'monthly' ? 'month' : 'period'
    const filteredSeries = selectedCategoryForGraph === 'all' 
      ? series 
      : series.map(s => ({
          [xKey]: s[xKey],
          [selectedCategoryForGraph]: s[selectedCategoryForGraph] || 0
        }))

    const totalSales = selectedCategoryForGraph === 'all'
      ? series.reduce((sum, s) => sum + (s.total || 0), 0)
      : series.reduce((sum, s) => sum + (s[selectedCategoryForGraph] || 0), 0)

    return { series, filteredSeries, xKey, totalSales }
  }, [categoryGranularity, businessTrends.monthlyCategorySeries, weeklyCat, selectedCategoryForGraph])


  // Fetch backend-driven counts for key BI cards (out of stock, low stock, slow-moving, active)
  useEffect(() => {
    let cancelled = false
    async function loadCounts() {
      try {
        setCountsLoading(true)
        
        // Read settings from localStorage (same as Stock Management page)
        let baseline = 10
        let activeDeadMonths = 6
        
        try {
          const savedThreshold = localStorage.getItem('baselineLowStockThreshold')
          if (savedThreshold) {
            const val = Number(savedThreshold)
            if (!isNaN(val) && val > 0) baseline = val
          }
          
          const savedMonths = localStorage.getItem('activeDeadMonths')
          if (savedMonths) {
            const val = Number(savedMonths)
            if (!isNaN(val) && val > 0) activeDeadMonths = val
          }
        } catch (e) {
          console.warn('Failed to read settings from localStorage', e)
        }
        
        const results = await Promise.allSettled([
          getOutOfStockProductsCached(),
          getLowStockProductsCached(baseline),
          getDeadStockCached(activeDeadMonths),
          getActiveStockCached(activeDeadMonths)
        ])

        if (!cancelled) {
          const [outRes, lowRes, deadRes, activeRes] = results
          if (outRes.status === 'fulfilled') setOutOfStockCountDb(Array.isArray(outRes.value) ? outRes.value.length : 0)
          if (lowRes.status === 'fulfilled') setLowStockCountDb(Array.isArray(lowRes.value) ? lowRes.value.length : 0)
          if (deadRes.status === 'fulfilled') setSlowMovingCountDb(Array.isArray(deadRes.value) ? deadRes.value.length : 0)
          if (activeRes.status === 'fulfilled') setActiveStockCountDb(Array.isArray(activeRes.value) ? activeRes.value.length : 0)
        }
      } catch (err) {
        console.warn('Failed to load backend BI counts:', err)
      } finally {
        if (!cancelled) setCountsLoading(false)
      }
    }

    loadCounts()
    return () => { cancelled = true }
  }, [])

  // Fetch time series data (monthly and weekly) on mount
  useEffect(() => {
    let cancelled = false
    async function loadTimeSeries() {
      try {
        setLoadingAnalytics(true)
        
        const [monthlyTs, weeklyTs] = await Promise.all([
          getSalesTimeSeries('monthly'),
          getSalesTimeSeries('weekly')
        ])

        if (!cancelled) {
          setMonthlySeriesDb(monthlyTs || [])
          setWeeklySeriesDb(weeklyTs || [])
        }
      } catch (err) {
        console.warn('Failed to load time series data:', err)
      } finally {
        if (!cancelled) setLoadingAnalytics(false)
      }
    }

    loadTimeSeries()
    return () => { cancelled = true }
  }, [])

  // Fetch channel data reactively when granularity or channel filter changes
  useEffect(() => {
    let cancelled = false
    async function loadChannelData() {
      try {
        setLoadingChannelData(true)
        
        const channelFilter = selectedChannel === 'all' ? undefined : selectedChannel
        const [channelMonthly, channelWeekly] = await Promise.all([
          getSalesByChannel('monthly', channelFilter),
          getSalesByChannel('weekly', channelFilter)
        ])

        if (!cancelled) {
          setChannelDataDb({
            channels: channelMonthly.channels || [],
            monthly: channelMonthly.data || [],
            weekly: channelWeekly.data || []
          })
        }
      } catch (err) {
        console.warn('Failed to load channel data:', err)
      } finally {
        if (!cancelled) setLoadingChannelData(false)
      }
    }

    loadChannelData()
    return () => { cancelled = true }
  }, [selectedChannel, channelGranularity])

  // Fetch category data reactively when granularity or category filter changes
  useEffect(() => {
    let cancelled = false
    async function loadCategoryData() {
      try {
        setLoadingCategoryData(true)
        
        const categoryFilter = selectedCategoryForGraph === 'all' ? undefined : selectedCategoryForGraph
        // Always request the full series (no minimum-sales pruning) for category charts.
        const [categoryMonthly, categoryWeekly] = await Promise.all([
          getSalesByCategory('monthly', categoryFilter, 0),
          getSalesByCategory('weekly', categoryFilter, 0)
        ])

        if (!cancelled) {
          setCategoryDataDb({
            categories: categoryMonthly.categories || [],
            monthly: categoryMonthly.data || [],
            weekly: categoryWeekly.data || []
          })
        }
      } catch (err) {
        console.warn('Failed to load category data:', err)
      } finally {
        if (!cancelled) setLoadingCategoryData(false)
      }
    }

    loadCategoryData()
    return () => { cancelled = true }
  }, [selectedCategoryForGraph, categoryGranularity])

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab)
    setVisitedTabs(prev => new Set([...prev, tab]))
    
    if (tab === 'trends' && !renderCharts.overall) {
      setRenderCharts({ overall: false, channel: false, category: false })
      setTimeout(() => setRenderCharts(prev => ({ ...prev, overall: true })), 0)
      setTimeout(() => setRenderCharts(prev => ({ ...prev, channel: true })), 100)
      setTimeout(() => setRenderCharts(prev => ({ ...prev, category: true })), 200)
    }
  }, [renderCharts.overall])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Loading inventory summary...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Inventory Summary</h1>
            <p className="mt-1 text-sm text-muted-foreground">
            High-level overview of your inventory performance and health
            <span className="ml-2">
              • Sales rate window: {salesWindowDays || 180} days
            </span>
            <span className="ml-2 text-gray-600 font-medium">
              • {loadingSales ? 'Loading sales data...' : `${salesData.size} products with sales data`}
            </span>
          </p>
        </div>
        {/* Header controls removed: category & time range selectors intentionally hidden per UX request */}
      </div>

  {/* Key Metrics Overview */}
  <InventoryMetricsCards
    stockHealthPercentage={metrics.stockHealthPercentage}
    stockHealthScore={metrics.stockHealthScore}
    healthyStock={metrics.healthyStock}
    totalProducts={metrics.totalProducts}
    avgDaysUntilStockout={metrics.avgDaysUntilStockout}
    totalUnitsSold={metrics.totalUnitsSold}
  />

      {/* Incoming Purchase Orders removed per request */}


      {/* Detailed Analysis Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="longevity">Inventory Longevity</TabsTrigger>
          <TabsTrigger value="categories">Category Breakdown</TabsTrigger>
          <TabsTrigger value="performance">Top Performers</TabsTrigger>
          <TabsTrigger value="trends">Overall Sales</TabsTrigger>
        </TabsList>

        <TabsContent value="longevity" className="space-y-4">
          {loadingSales ? (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50 animate-pulse" />
                  <p className="text-muted-foreground">Loading sales data to calculate inventory longevity...</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <InventoryLongevityTab
              longevityDistribution={metrics.longevityDistribution}
              totalProducts={metrics.totalProducts}
            />
          )}
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <CategoryBreakdownTab
            topCategories={topCategories}
            categoryUnitFilter={categoryUnitFilter}
            onFilterChange={setCategoryUnitFilter}
            onCategoryClick={(categoryName: string) => {
              // Select category for the category chart but do NOT switch tabs.
              setSelectedCategoryForGraph(categoryName)
            }}
          />

          {/* Sales by Category chart moved into the Categories tab for faster context and instant feedback */}
          <Card className="mt-4">
            <CardHeader>
              <div className="w-full flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  📦 Individual Category Sales
                </CardTitle>
              </div>
              <CardDescription>
                {selectedCategoryForGraph === 'all' ? 'View sales across all categories' : `Sales performance for ${selectedCategoryForGraph}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCategoryData || !categoryChartData ? (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
              ) : (
                <SalesByCategoryChart
                  categoryGranularity={categoryGranularity}
                  selectedCategoryForGraph={selectedCategoryForGraph}
                  categoryChartData={categoryChartData}
                  categoryColors={categoryColors}
                  categoryKeysForGraph={businessTrends.categoryKeysForGraph}
                  onCategoryChange={setSelectedCategoryForGraph}
                  onGranularityChange={setCategoryGranularity}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <TopPerformersTab
            topSkus={topSkus}
            products={products}
            allSales={allSales}
            channelHex={channelHex}
            getCanonicalChannelName={getCanonicalChannelName}
            topSkusLimit={topSkusLimit}
            onTopSkusLimitChange={setTopSkusLimit}
          />
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          {!visitedTabs.has('trends') ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Loading trends...</p>
              </div>
            </div>
          ) : loadingAnalytics ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50 animate-pulse" />
                <p>Loading analytics data...</p>
              </div>
            </div>
          ) : (
            <>
              {renderCharts.overall && (
                <Card>
                  <CardHeader>
                    <div className="w-full flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-lg">📈 Overall Sales</CardTitle>
                      <div className="flex items-center gap-3">
                        <select value={chartGranularity} onChange={(e) => setChartGranularity(e.target.value as any)} className="px-2 py-1 rounded border bg-card text-card-foreground text-sm">
                          <option value="monthly">Monthly</option>
                          <option value="weekly">Weekly</option>
                        </select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <OverallSalesChart
                      chartGranularity={chartGranularity}
                      monthlySalesSeries={monthlySalesSeries}
                      weeklySeries={weeklySeries}
                    />
                  </CardContent>
                </Card>
              )}

              {renderCharts.overall && (
                <div className="bg-muted p-4 rounded-lg mt-4">
                  <h4 className="font-semibold mb-3">Sales Summary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">Total Period Sales:</span>
                      <div className="text-lg font-bold text-gray-900">{totalPeriodSales} units</div>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Avg Monthly Sales / SKU</span>
                      <div className="text-lg font-bold text-gray-900">{Math.round(metrics.avgMonthlySales).toLocaleString()} units</div>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Overall Monthly Growth (MoM)</span>
                      <div className="text-lg font-bold text-gray-900">{monthlyGrowthDisplay}</div>
                    </div>
                  </div>
                </div>
              )}

              {renderCharts.channel && (
                <Card className="mt-4">
                  <CardHeader>
                    <div className="w-full flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        📊 Sales by Channel
                      </CardTitle>
                    </div>
                    <CardDescription>
                      {selectedChannel === 'all' ? 'View sales across all channels' : `Sales performance for ${selectedChannel}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SalesByChannelChart
                      channelGranularity={channelGranularity}
                      selectedChannel={selectedChannel}
                      channelChartData={channelChartData}
                      channelHex={channelHex}
                      channelKeys={businessTrends.channelKeys}
                      getCanonicalChannelName={getCanonicalChannelName}
                      onChannelChange={setSelectedChannel}
                      onGranularityChange={setChannelGranularity}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Sales by Category removed from trends tab - it lives in the Categories tab only */}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}