"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import { ArrowLeft, TrendingUp, TrendingDown, Package, DollarSign, BarChart3, Clock, Activity, Zap, AlertCircle } from "lucide-react"
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, Legend, PieChart, Pie, LineChart } from 'recharts'

// Scoped CSS for hiding scrollbars while preserving scroll functionality
const hideScrollbarStyles = `
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Line animation for the overall sales polyline */
.line-animate {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: draw 900ms ease forwards;
}
.area-animate {
  opacity: 0;
  animation: fadeArea 900ms ease 200ms forwards;
}
@keyframes draw {
  to { stroke-dashoffset: 0; }
}
@keyframes fadeArea {
  to { opacity: 1; }
}
`


import { useAppToast } from '@/lib/use-toast'
import type { Product } from "@/components/stock/stock-management"
import { getProductsCached as getProducts, getSalesBySku, getSalesByChannelSummaryForSku, getMarketShareForSku, isSkuActiveOnBackend, analyzeSalesData } from '@/lib/api'

interface Sale {
  sale_id: number
  channel: string
  date: string
  sku: string
  quantity: number
  created_at?: string
}

interface ProductDetailsProps {
  productId: string
}



const GRID_LINE_COUNT = 6
const BAR_SLOT_WIDTH = 48
const BAR_GAP = 12
const LEFT_PADDING = 48
const RIGHT_PADDING = 24
const MIN_CHART_WIDTH = 720

// Channel color mapping for consistent visualization
const channelColors = {
  'Shopee': 'bg-orange-500',
  'Facebook': 'bg-blue-500', 
  'TikTok': 'bg-pink-500',
  'TIKTOK': 'bg-pink-500',
  'Instagram': 'bg-purple-500',
  'Lazada': 'bg-indigo-500',
  'LINE': 'bg-green-500',
  'Website': 'bg-gray-700',
  'Store': 'bg-yellow-600',
  'unknown': 'bg-gray-400',
  'default': 'bg-slate-500'
}

const getChannelColor = (channel: string): string => {
  const normalizedChannel = channel?.toLowerCase().replace(/[^a-z]/g, '')
  const colorKey = Object.keys(channelColors).find(key => 
    key.toLowerCase().replace(/[^a-z]/g, '') === normalizedChannel
  )
  return channelColors[colorKey as keyof typeof channelColors] || channelColors.default
}

// Return a canonical display name for a channel so that variants like
// 'TIKTOK', 'TikTok', 'Tik Tok' map to a single label in legends and charts.
const getCanonicalChannelName = (channel: string | undefined | null) => {
  const raw = (channel ?? 'unknown').toString().trim()
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, '')
  // Exact/normalized match first
  const matchKey = Object.keys(channelColors).find(key =>
    key.toLowerCase().replace(/[^a-z]/g, '') === normalized
  )
  if (matchKey) return matchKey

  // Substring heuristic: map noisy labels like 'shopee - pajara official' -> 'Shopee'
  const lowered = raw.toLowerCase()
  for (const key of Object.keys(channelColors)) {
    const k = key.toLowerCase()
    if (k && lowered.includes(k)) return key
  }

  // If no known mapping, capitalize first letter and return trimmed raw
  return raw === '' ? 'unknown' : raw
}

export function ProductDetails({ productId }: ProductDetailsProps) {
  const router = useRouter()
  const { push: pushToast } = useAppToast()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [loadingSales, setLoadingSales] = useState(true)
  const [backendActive, setBackendActive] = useState<boolean | null>(null)
  const [activityMonths, setActivityMonths] = useState<number>(6)
  const [selectedChannelTrend, setSelectedChannelTrend] = useState<string>('all')
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [marketShare, setMarketShare] = useState<any | null>(null)
  const [skuChannelSummary, setSkuChannelSummary] = useState<{ channel: string; total: number }[] | null>(null)
  const [loadingSkuChannelSummary, setLoadingSkuChannelSummary] = useState(false)

  const fetchProductSales = async (productSku: string) => {
    try {
      setLoadingSales(true)
      // Always fetch sales from backend; API returns an array shaped like the DB rows
      const skuSales = await getSalesBySku(productSku)
      const mapped: Sale[] = (skuSales || []).map((s: any, idx: number) => {
        const dateVal = s.transaction_date ?? s.date
        let dateIso = ''
        try {
          dateIso = dateVal ? new Date(dateVal).toISOString() : ''
        } catch (e) {
          dateIso = String(dateVal || '')
        }
          return {
            sale_id: s.sale_id ?? (idx + 1),
            channel: getCanonicalChannelName(s.platform ?? s.channel),
            date: dateIso,
            sku: s.item_id ?? s.sku ?? productSku,
            quantity: Number(s.quantity ?? 0)
          }
      })
      // Sort by date (most recent first)
      mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setSales(mapped)
    } catch (err: any) {
      console.error('Error fetching sales:', err)
      pushToast({
        title: "Error Loading Sales",
        description: "Failed to load sales data.",
        variant: "error"
      })
      // Do not fallback to mock sales data; clear sales so UI remains accurate
      setSales([])
    } finally {
      setLoadingSales(false)
    }
  }

  // Mock sales generator removed — UI relies on backend-only sales data.

  // Prepare chart data for monthly sales over time
  // Chart data preparation helpers (monthly and weekly)
  const prepareMonthlySalesChartData = () => {
    if (!Array.isArray(sales) || sales.length === 0) return []

    // Group sales by month and channel
    const salesByMonth: Record<string, Record<string, number>> = {}
    sales.forEach(sale => {
      if (!sale || !sale.date) return
      try {
        const saleDate = new Date(sale.date)
        if (isNaN(saleDate.getTime())) return
        const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`
        const channel = sale.channel || 'unknown'
        const quantity = Number(sale.quantity || 0)
        if (!isFinite(quantity)) return
        
        if (!salesByMonth[monthKey]) salesByMonth[monthKey] = {}
        if (!salesByMonth[monthKey][channel]) salesByMonth[monthKey][channel] = 0
        salesByMonth[monthKey][channel] += quantity
      } catch (error) {
        console.warn('Error processing sale for monthly chart:', error)
      }
    })

    const chartData = Object.entries(salesByMonth).map(([monthKey, channelData]) => {
      const [year, month] = monthKey.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1, 1)
      const totalForMonth = Object.values(channelData).reduce((sum, qty) => sum + qty, 0)
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        xLabel: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        fullDate: monthKey,
        sortDate: date.getTime(),
        total: totalForMonth,
        ...channelData
      }
    }).sort((a, b) => a.sortDate - b.sortDate)

    return chartData
  }

  const prepareWeeklySalesChartData = () => {
    if (!Array.isArray(sales) || sales.length === 0) return []

    // Group sales by week starting on Monday and by channel
    const salesByWeek: Record<string, Record<string, number>> = {}
    sales.forEach(sale => {
      if (!sale || !sale.date) return
      try {
        const d = new Date(sale.date)
        if (isNaN(d.getTime())) return
        // Calculate Monday of the week
        const day = d.getDay() // 0 (Sun) - 6 (Sat)
        const diffToMonday = (day + 6) % 7 // 0 for Mon, 6 for Sun
        const monday = new Date(d)
        monday.setDate(d.getDate() - diffToMonday)
        monday.setHours(0, 0, 0, 0)
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
        const channel = sale.channel || 'unknown'
        const quantity = Number(sale.quantity || 0)
        if (!isFinite(quantity)) return
        
        if (!salesByWeek[weekKey]) salesByWeek[weekKey] = {}
        if (!salesByWeek[weekKey][channel]) salesByWeek[weekKey][channel] = 0
        salesByWeek[weekKey][channel] += quantity
      } catch (error) {
        console.warn('Error processing sale for weekly chart:', error)
      }
    })

    // First, group weeks by month
    const weeksByMonth: Record<string, any[]> = {}
    Object.entries(salesByWeek).forEach(([weekKey, channelData]) => {
      const [year, month, day] = weekKey.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      const monthKey = `${year}-${month}` // YYYY-MM format
      const totalForWeek = Object.values(channelData).reduce((sum, qty) => sum + qty, 0)
      
      if (!weeksByMonth[monthKey]) weeksByMonth[monthKey] = []
      
      weeksByMonth[monthKey].push({
        weekKey,
        date,
        channelData,
        total: totalForWeek
      })
    })

    // Create chart data with individual weekly entries
    const chartData: any[] = []
    
    Object.entries(weeksByMonth).forEach(([monthKey, weeks]) => {
      const [year, month] = monthKey.split('-')
      
      // Sort weeks within the month
      weeks.sort((a, b) => a.date.getTime() - b.date.getTime())
      
      // Create an entry for each individual week
      weeks.forEach((week, weekIndex) => {
        const weekNumber = weekIndex + 1
        const weekStartDate = week.date.getDate()
        const monthName = week.date.toLocaleDateString('en-US', { month: 'short' })
        
        // Create weekly label showing week of month
        const weekLabel = `${monthName} W${weekNumber}`
        
        // Create channel data object for this specific week
        const weekChannelData: Record<string, number> = {}
        Object.entries(week.channelData).forEach(([channel, quantity]) => {
          const qty = Number(quantity || 0)
          if (channel && typeof channel === 'string' && qty > 0) {
            weekChannelData[channel] = qty
          }
        })
        
        chartData.push({
          date: weekLabel,
          xLabel: weekLabel,
          fullDate: week.weekKey,
          sortDate: week.date.getTime(),
          total: week.total,
          monthKey,
          weekNumber,
          weekStartDate,
          ...weekChannelData
        })
      })
    })

    return chartData.sort((a, b) => a.sortDate - b.sortDate)
  }
  // Chart granularity state: 'monthly' | 'weekly' | 'range'
  const [chartGranularity, setChartGranularity] = useState<'monthly' | 'weekly' | 'range'>('monthly')
  // Today's ISO date used for defaults
  const todayIso = new Date().toISOString().slice(0, 10)
  // For custom range view, store start/end dates (default last 7 days)
  const defaultEnd = todayIso
  const defaultStart = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().slice(0, 10)
  const [rangeStartDate, setRangeStartDate] = useState<string>(defaultStart)
  const [rangeEndDate, setRangeEndDate] = useState<string>(defaultEnd)
  // Toggle whether to show days with zero sales in range mode
  const [showEmptyDays, setShowEmptyDays] = useState<boolean>(true)
  // Selected month for sales comparison (YYYY-MM). Default to current month.
  const [selectedMonth, setSelectedMonth] = useState<string>(todayIso.slice(0, 7))
  // Sales view: 'by-channel' (stacked bars) or 'overall' (line graph)
  const [salesView, setSalesView] = useState<'by-channel' | 'overall'>('by-channel')

  const prepareSalesChartData = () => {
    if (chartGranularity === 'weekly') return prepareWeeklySalesChartData()
    if (chartGranularity === 'range') return prepareRangeSalesChartData(rangeStartDate, rangeEndDate)
    return prepareMonthlySalesChartData()
  }

  const prepareDailySalesChartData = (dateIso: string) => {
    if (sales.length === 0) return []
    const target = dateIso || todayIso
    // Filter sales that match the target date (compare YYYY-MM-DD)
    const filtered = sales.filter(s => {
      try {
        const d = new Date(s.date)
        return d.toISOString().slice(0, 10) === target
      } catch (e) {
        return String(s.date || '').slice(0, 10) === target
      }
    })
    // Aggregate by channel
    const byChannel: Record<string, number> = {}
    filtered.forEach(s => {
      const ch = s.channel || 'unknown'
      byChannel[ch] = (byChannel[ch] || 0) + Number(s.quantity || 0)
    })
    const total = Object.values(byChannel).reduce((sum, v) => sum + v, 0)
  const point: any = { date: new Date(target).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), xLabel: new Date(target).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), fullDate: target, sortDate: new Date(target).getTime(), total }
    for (const [ch, qty] of Object.entries(byChannel)) point[ch] = qty
    return [point]
  }

  const prepareRangeSalesChartData = (startIso: string, endIso: string) => {
    if (!Array.isArray(sales) || sales.length === 0) return []
    const start = new Date(startIso)
    const end = new Date(endIso)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return []

    // Build a map of date -> channel -> qty
    const byDate: Record<string, Record<string, number>> = {}
    sales.forEach(s => {
      if (!s || !s.date) return
      try {
        const d = new Date(s.date)
        if (isNaN(d.getTime())) return
        const iso = d.toISOString().slice(0, 10)
        if (iso < startIso || iso > endIso) return
        const ch = s.channel || 'unknown'
        const quantity = Number(s.quantity || 0)
        if (!isFinite(quantity)) return
        
        if (!byDate[iso]) byDate[iso] = {}
        byDate[iso][ch] = (byDate[iso][ch] || 0) + quantity
      } catch (e) {
        console.warn('Error processing sale for range chart:', e)
      }
    })

    // Ensure each date in the range appears (even if zero)
    const results: any[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10)
      const channelData = byDate[iso] || {}
      const totalForDay = Object.values(channelData).reduce((s, v) => s + v, 0)
  const point: any = { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), xLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), fullDate: iso, sortDate: new Date(iso).getTime(), total: totalForDay }
      for (const [ch, qty] of Object.entries(channelData)) point[ch] = qty
      results.push(point)
    }
    return results
  }
  // Stock movement graphs and mock generators removed — stock movements not used in this component

  const fetchProduct = async () => {
    try {
      setLoading(true)
      setError(null)
      
      let productData: Product
      // Always try to fetch product from backend
      try {
        const products = await getProducts()
        setAllProducts(products)
        const foundProduct = products.find(p => p.id?.toString() === productId || p.sku === productId)
        if (!foundProduct) {
          // Do not throw here; surface the error to the UI and bail out gracefully.
          setProduct(null)
          setSales([])
          setError('Product not found')
          return
        }
        productData = foundProduct
      } catch (backendError) {
        console.error('Backend fetch failed or product not found:', backendError)
        setProduct(null)
        setSales([])
        setError((backendError as any)?.message || 'Product not found')
        return
      }

      setProduct(productData)
      // Fetch sales data for this product
      await fetchProductSales(productData.sku)
      // Fetch PO rows for this SKU (temporarily disabled)
      /*
      // Fetch PO rows for this SKU (temporarily disabled)
      /*
      try {
        setLoadingPo(true)
        const rows = await getPOsBySku(productData.sku)
        setPoRows(Array.isArray(rows) ? rows : [])
      } catch (e) {
        console.warn('Failed to fetch PO rows for product:', e)
        setPoRows([])
      } finally {
        setLoadingPo(false)
      }
      */
      // Market share is loaded lazily after initial render to avoid transferring large global sales data.
      // We'll schedule a non-blocking fetch for market share below.
      // Fetch simple overall channel totals for this SKU (preferred for product page)
      try {
        setLoadingSkuChannelSummary(true)
        const summary = await getSalesByChannelSummaryForSku(productData.sku)
        setSkuChannelSummary(Array.isArray(summary.items) ? summary.items.map((it: any) => ({ channel: it.channel, total: Number(it.total || 0) })) : [])
      } catch (e) {
        console.warn('Failed to fetch SKU channel summary', e)
        setSkuChannelSummary(null)
      } finally {
        setLoadingSkuChannelSummary(false)
      }

      // Lazy-load market share after initial product data and channel summary are set.
      // Do not block the main fetchProduct flow on this.
      (async () => {
        try {
          const ms = await getMarketShareForSku(productData.sku)
          setMarketShare(ms)
        } catch (e) {
          console.warn('Failed to fetch market share lazily', e)
        }
      })()
      // Determine months window from user settings (Stock Management stores this in localStorage)
      try {
        let months = 6
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('activeDeadMonths')
          const parsed = saved ? Number(saved) : NaN
          if (!isNaN(parsed) && parsed > 0) months = parsed
        }
        setActivityMonths(months)
        // Ask backend whether this SKU is active (authoritative) using the same months window
        const active = await isSkuActiveOnBackend(productData.sku, months)
        setBackendActive(active)
      } catch (e) {
        console.error('Error checking backend active flag', e)
        setBackendActive(null)
      }
    } catch (err: any) {
      console.error('Error loading product:', err)
      setError(err.message || 'Failed to load product')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (productId) {
      fetchProduct()
    }
  }, [productId])

  const chartData = prepareSalesChartData()
  // If user hides empty days in range mode, filter them out for display
  const displayedChartData = (chartGranularity === 'range' && !showEmptyDays)
    ? chartData.filter(d => d.total && d.total > 0)
    : chartData

  const chartMetrics = useMemo(() => {
    if (!Array.isArray(displayedChartData) || displayedChartData.length === 0) {
      return { maxTotal: 1, innerWidth: MIN_CHART_WIDTH }
    }

    const maxTotal = displayedChartData.reduce((max, dataPoint) => {
      if (!dataPoint || typeof dataPoint !== 'object') return max
      const total = typeof dataPoint.total === 'number' ? dataPoint.total : Number(dataPoint.total || 0)
      return Math.max(max, total)
    }, 0)
    const contentWidth = (displayedChartData.length * BAR_SLOT_WIDTH) + (Math.max(displayedChartData.length - 1, 0) * BAR_GAP) + LEFT_PADDING + RIGHT_PADDING
    return {
      maxTotal: Math.max(maxTotal, 1),
      innerWidth: Math.max(contentWidth, MIN_CHART_WIDTH),
    }
  }, [displayedChartData])
  
  // Normalize data for Recharts: ensure numeric totals and xLabel exist
  const rechartsData = useMemo(() => {
    if (!Array.isArray(displayedChartData)) return []
    return displayedChartData
      .filter(d => d && typeof d === 'object' && d.xLabel)
      .map((d: any, index) => {
        // Create a safe normalized entry
        const normalized: any = {
          xLabel: String(d.xLabel || d.date || `Entry-${index + 1}`),
          total: typeof d.total === 'number' ? d.total : Number(d.total || 0),
          fullDate: d.fullDate || '',
          sortDate: d.sortDate || 0
        }
        
        // Add channel data safely
        Object.keys(d).forEach(key => {
          if (key && 
              typeof key === 'string' && 
              !['xLabel', 'total', 'date', 'fullDate', 'sortDate', 'weekIndex'].includes(key) &&
              d[key] !== undefined && 
              d[key] !== null) {
            const value = Number(d[key])
            if (isFinite(value) && value > 0) {
              normalized[key] = value
            }
          }
        })
        
        return normalized
      })
  }, [displayedChartData])
  
  // Compute responsive Y axis max depending on view and selected channel
  const yAxisMax = useMemo(() => {
    try {
      if (salesView === 'overall' || selectedChannelTrend === 'all') {
        return Math.max(chartMetrics.maxTotal || 1, 1)
      }

      if (rechartsData && Array.isArray(rechartsData) && selectedChannelTrend) {
        let max = 0
        for (const pt of rechartsData) {
          if (!pt || typeof pt !== 'object') continue
          const v = Number(pt[selectedChannelTrend] || 0)
          if (isFinite(v)) max = Math.max(max, Math.abs(v))
        }
        return Math.max(1, Math.ceil(max * 1.1))
      }

      return Math.max(chartMetrics.maxTotal || 1, 1)
    } catch (e) {
      return Math.max(chartMetrics.maxTotal || 1, 1)
    }
  }, [salesView, selectedChannelTrend, rechartsData, chartMetrics.maxTotal])
  const gridLineSteps = Math.max(GRID_LINE_COUNT - 1, 1)
  // Ensure channel keys are strings and provide a canonical fallback
  const uniqueChannels = Array.from(new Set(sales.map(sale => (sale.channel ?? 'unknown').toString())))
  // Color palette for stacked bars
  const palette = ['#3b82f6', '#fb923c', '#ec4899', '#8b5cf6', '#6366f1', '#10b981', '#f59e0b', '#94a3b8']
  const getPaletteColor = (idx: number) => {
    if (!palette || palette.length === 0) return '#94a3b8'
    const i = typeof idx === 'number' && isFinite(idx) && idx >= 0 ? (idx % palette.length) : 0
    return palette[i] || '#94a3b8'
  }

  // Determine channel keys that actually exist in the recharts data (exclude meta keys)
  const channelsForChart = useMemo(() => {
    const reserved = new Set(['xLabel', 'total', 'date', 'fullDate', 'sortDate', 'weekIndex', 'monthKey', 'weekNumber', 'weekStartDate'])
    const channelSet = new Set<string>()
    
    if (Array.isArray(rechartsData) && rechartsData.length > 0) {
      rechartsData.forEach(pt => {
        if (!pt || typeof pt !== 'object') return
        Object.keys(pt).forEach(k => {
          if (k && 
              typeof k === 'string' && 
              k.trim() && 
              !reserved.has(k) && 
              typeof pt[k] === 'number' && 
              isFinite(pt[k]) && 
              pt[k] > 0) {
            channelSet.add(k.trim())
          }
        })
      })
    }
    
    return Array.from(channelSet).sort() // Sort for consistent ordering
  }, [rechartsData])

  // Only keep channels that actually have numeric values in the data (defensive)
  const channelsForChartFiltered = useMemo(() => {
    if (!Array.isArray(channelsForChart) || !Array.isArray(rechartsData)) return []
    return channelsForChart.filter(ch => {
      if (!ch || typeof ch !== 'string') return false
      for (const pt of rechartsData) {
        if (!pt || typeof pt !== 'object') continue
        const v = pt[ch]
        if (v === null || v === undefined) continue
        const num = Number(v)
        if (!isNaN(num) && isFinite(num)) return true
      }
      return false
    })
  }, [channelsForChart, rechartsData])

  // Prepare channel history data (monthly breakdown per channel)
  const channelHistoryData = useMemo(() => {
    if (!Array.isArray(sales) || sales.length === 0) return []
    
    const salesByMonthChannel: Record<string, Record<string, number>> = {}
    sales.forEach(sale => {
      if (!sale || !sale.date) return
      try {
        const saleDate = new Date(sale.date)
        if (isNaN(saleDate.getTime())) return
        const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`
        const channel = sale.channel || 'unknown'
        const quantity = Number(sale.quantity || 0)
        if (!isFinite(quantity)) return
        
        if (!salesByMonthChannel[monthKey]) salesByMonthChannel[monthKey] = {}
        if (!salesByMonthChannel[monthKey][channel]) salesByMonthChannel[monthKey][channel] = 0
        salesByMonthChannel[monthKey][channel] += quantity
      } catch (error) {
        console.warn('Error processing sale for channel history:', error)
      }
    })

    const data = Object.entries(salesByMonthChannel).map(([monthKey, channelData]) => {
      const [year, month] = monthKey.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1, 1)
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        monthKey,
        sortDate: date.getTime(),
        ...channelData
      }
    }).sort((a, b) => a.sortDate - b.sortDate)

    return data
  }, [sales])

  // Calculate market share in category
  const marketShareData = useMemo(() => {
    // Use only backend-provided market share, no fallback
    if (marketShare && typeof marketShare === 'object') {
      return {
        categoryTotal: Number(marketShare.category_total || 0),
        productTotal: Number(marketShare.product_total || 0),
        marketShare: Number(marketShare.product_share_of_category || 0),
        overallMarketShare: Number(marketShare.product_share_of_overall || 0),
        totalInCategory: 0,
        categoryName: marketShare.category || ''
      }
    }

    // Return empty structure if no backend data
    return { categoryTotal: 0, productTotal: 0, marketShare: 0, rank: 0, totalInCategory: 0, categoryName: '' }
  }, [marketShare])

  // Custom tooltip for the sales-by-channel bar chart.
  // Shows the xLabel, total, and a breakdown of units per channel with colored swatches.
  

  // Simple tooltip for the channel breakdown chart (shows channel and qty)
  const ChannelTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    const point = payload[0].payload || {}
    const qty = Number(point.quantity || 0)
    return (
      <div className="bg-card text-card-foreground border rounded shadow-sm p-2 text-sm" style={{ minWidth: 160 }}>
        <div className="font-medium mb-1">{point.channel}</div>
        <div className="text-xs text-muted-foreground">{qty} units</div>
      </div>
    )
  }

  const ChannelPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    const data = payload[0]
    const channel = data.name || 'Unknown'
    const value = Number(data.value || 0)
    const percentage = Number(data.payload?.percentage || 0)
    return (
      <div className="bg-card text-card-foreground border rounded shadow-sm p-2 text-sm" style={{ minWidth: 140 }}>
        <div className="font-medium mb-1">{channel}</div>
        <div className="text-xs text-muted-foreground">
          {value} units ({percentage.toFixed(1)}%)
        </div>
      </div>
    )
  }


  // Debug logging
  console.log('Sales data:', sales.length, 'sales')
  console.log('Chart data:', chartData.length, 'points')
  console.log('Displayed chart sample:', displayedChartData.slice(0,5))
  console.log('Displayed chart data:', displayedChartData.length)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground dark:text-gray-300">Loading product...</p>
      </div>
    )
  }

  const safeBack = () => {
    try {
      // If there is navigation history, go back. Otherwise, push to the stock list.
      if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
        router.back()
      } else {
        router.push('/dashboard/stock')
      }
    } catch (err) {
      // Fallback to push in case router.back() fails
      router.push('/dashboard/stock')
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive mb-2">Error loading product</p>
          <p className="text-muted-foreground text-sm dark:text-gray-300">{error}</p>
          <Button variant="outline" onClick={safeBack} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground mb-2 dark:text-gray-300">Product not found</p>
          <Button variant="outline" onClick={safeBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  const getStockLevel = (product: Product) => {
    return product.stock_level ?? product.quantity ?? 0
  }

  const getStockStatus = (product: Product) => {
    const quantity = getStockLevel(product)
    const threshold = product.low_stock_threshold
    if (quantity === 0) return { label: "Out of Stock", variant: "destructive" as const }
    if (quantity <= threshold) return { label: "Low Stock", variant: "secondary" as const }
    return { label: "In Stock", variant: "default" as const }
  }

  const status = getStockStatus(product)
  const currentStock = getStockLevel(product)
  
  // Calculate sales analytics
  const totalSales = sales.reduce((sum, sale) => sum + sale.quantity, 0)

  // Use only the backend summary endpoint for per-SKU channel totals.
  // If the summary is not available, treat as no channel data (do not fall back to client-side grouping).
  const channelBreakdown: Record<string, number> = (() => {
    if (skuChannelSummary && Array.isArray(skuChannelSummary) && skuChannelSummary.length > 0) {
      const out: Record<string, number> = {}
      skuChannelSummary.forEach(row => {
        const ch = row.channel || 'unknown'
        out[ch] = (out[ch] || 0) + Number(row.total || 0)
      })
      return out
    }
    return {}
  })()

  // Prepare channel chart data for Recharts (for Sales by Channel)
  const channelChartData = Object.entries(channelBreakdown).map(([channel, quantity]) => ({ channel, quantity }))

  // Simple color map for channels (fall back to gray)
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
  // Ensure product-details uses same canonicalization + channelHex for tooltip swatches
  // SalesTooltip updated to prefer canonicalized channel names and shared hex map
  const SalesTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null
    const point = payload[0].payload || {}
    const total = typeof point.total === 'number' ? point.total : Number(point.total || 0)

    return (
      <div className="bg-card text-card-foreground border rounded shadow-sm p-2 text-sm" style={{ minWidth: 160 }}>
        <div className="font-medium mb-1">{label}</div>
        <div className="text-xs text-muted-foreground mb-2">Total: {total} units</div>
        <div className="space-y-1">
          {channelsForChartFiltered.map((ch: string, idx: number) => {
            if (!ch || typeof ch !== 'string') return null
            const val = Number(point[ch] || 0)
            if (!isFinite(val) || val <= 0) return null
            const canonical = getCanonicalChannelName(ch)
            const color = channelHex[canonical] || getPaletteColor(idx)
            return (
              <div key={`tt-${ch}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div style={{ width: 10, height: 10, backgroundColor: color, borderRadius: 2 }} />
                  <div className="capitalize">{canonical}</div>
                </div>
                <div className="font-semibold">{val}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  
  const _channelEntries = Object.entries(channelBreakdown).sort(([,a], [,b]) => b - a)
  const topChannel = _channelEntries.length > 0 ? _channelEntries[0][0] : 'N/A'

  const channelPieData = _channelEntries.map(([channel, quantity]) => ({
    name: channel,
    value: quantity,
    percentage: totalSales > 0 ? (quantity / totalSales) * 100 : 0
  }))
    
  const recentSales = sales.filter(sale => {
    const saleDate = new Date(sale.date)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return saleDate >= sevenDaysAgo
  })

  // Monthly totals map: YYYY-MM -> total qty
  const monthlyTotals: Record<string, number> = {}
  sales.forEach(s => {
    try {
      const d = new Date(s.date)
      const key = d.toISOString().slice(0, 7) // YYYY-MM
      monthlyTotals[key] = (monthlyTotals[key] || 0) + Number(s.quantity || 0)
    } catch (e) {
      // ignore unparsable dates
    }
  })

  const prevMonthFrom = (ym: string) => {
    const [y, m] = ym.split('-').map(Number)
    if (!y || !m) return ''
    const date = new Date(y, m - 1, 1)
    date.setMonth(date.getMonth() - 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  const selectedMonthTotal = monthlyTotals[selectedMonth] || 0
  const prevMonthKey = prevMonthFrom(selectedMonth)
  const prevMonthTotal = monthlyTotals[prevMonthKey] || 0
  const monthPctChange = prevMonthTotal === 0 ? (selectedMonthTotal === 0 ? 0 : Infinity) : ((selectedMonthTotal - prevMonthTotal) / prevMonthTotal) * 100

  // Average daily sales for last 30 days
  const last30Start = new Date()
  last30Start.setDate(last30Start.getDate() - 29)
  last30Start.setHours(0,0,0,0)
  let last30Total = 0
  sales.forEach(s => {
    try {
      const d = new Date(s.date)
      const iso = d.toISOString().slice(0,10)
      if (iso >= last30Start.toISOString().slice(0,10)) last30Total += Number(s.quantity || 0)
    } catch (e) {}
  })
  const avgDaily30 = last30Total / 30
  // If current stock is zero, explicitly show 0 days remaining.
  // Otherwise, if avgDaily30 > 0 compute the rounded days, else treat as Infinity (no sales)
  const daysOfInventoryRemaining = currentStock === 0 ? 0 : (avgDaily30 > 0 ? Math.round(currentStock / avgDaily30) : Infinity)

  // Use backend-consistent logic via analyzeSalesData
  const salesAnalysis = analyzeSalesData(sales)
  const isActive = salesAnalysis.isActive

  // Calculate sales velocity (units per day over last 30 days)
  const salesVelocity = avgDaily30

  // Calculate 30-day and 60-day sales for trend comparison
  const last60Start = new Date()
  last60Start.setDate(last60Start.getDate() - 59)
  last60Start.setHours(0,0,0,0)
  let last60Total = 0
  let first30Of60Total = 0
  sales.forEach(s => {
    try {
      const d = new Date(s.date)
      const iso = d.toISOString().slice(0,10)
      const qty = Number(s.quantity || 0)
      if (iso >= last60Start.toISOString().slice(0,10) && iso < last30Start.toISOString().slice(0,10)) {
        first30Of60Total += qty
      }
      if (iso >= last60Start.toISOString().slice(0,10)) {
        last60Total += qty
      }
    } catch (e) {}
  })
  const salesTrend = first30Of60Total === 0 ? (last30Total === 0 ? 0 : 100) : ((last30Total - first30Of60Total) / first30Of60Total) * 100
  const trendDirection = salesTrend > 5 ? 'up' : salesTrend < -5 ? 'down' : 'stable'

  // Find best and worst selling periods (months)
  const bestMonth = Object.entries(monthlyTotals).sort(([,a], [,b]) => b - a)[0]
  const worstMonth = Object.entries(monthlyTotals).sort(([,a], [,b]) => a - b)[0]

  // Calculate channel trends (last 30 days vs previous 30 days)
  const channelTrends: Record<string, { current: number, previous: number, trend: number, direction: 'up' | 'down' | 'stable' }> = {}
  Object.keys(channelBreakdown).forEach(channel => {
    let current30 = 0
    let previous30 = 0
    sales.forEach(s => {
      if (s.channel === channel) {
        try {
          const d = new Date(s.date)
          const iso = d.toISOString().slice(0,10)
          const qty = Number(s.quantity || 0)
          if (iso >= last30Start.toISOString().slice(0,10)) {
            current30 += qty
          } else if (iso >= last60Start.toISOString().slice(0,10) && iso < last30Start.toISOString().slice(0,10)) {
            previous30 += qty
          }
        } catch (e) {}
      }
    })
    const trend = previous30 === 0 ? (current30 === 0 ? 0 : 100) : ((current30 - previous30) / previous30) * 100
    channelTrends[channel] = {
      current: current30,
      previous: previous30,
      trend,
      direction: trend > 5 ? 'up' : trend < -5 ? 'down' : 'stable'
    }
  })
  
  return (
    <div className="space-y-6">
      <style jsx>{hideScrollbarStyles}</style>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={safeBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
            <div>
              <h1 className="text-3xl font-bold">{product.name}</h1>
              <p className="text-muted-foreground dark:text-gray-300">SKU: {product.sku}</p>
            </div>
        </div>
      </div>

      {/* Product Overview Cards (updated per request) */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground dark:text-gray-300" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentStock}</div>
            <Badge variant={status.variant} className="mt-2">{status.label}</Badge>
          </CardContent>
        </Card>
        {/* Incoming PO rows for this product (placeholder - moved below) */}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Days of Inventory Remaining</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground dark:text-gray-300" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{daysOfInventoryRemaining === Infinity ? '∞' : daysOfInventoryRemaining}</div>
            <p className="text-xs text-muted-foreground dark:text-gray-300 mt-2">Based on 30-day avg sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales Velocity</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground dark:text-gray-300" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesVelocity.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground dark:text-gray-300 mt-2">Units per day (30-day avg)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales Trend</CardTitle>
            {trendDirection === 'up' ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : trendDirection === 'down' ? (
              <TrendingDown className="h-4 w-4 text-red-600" />
            ) : (
              <Activity className="h-4 w-4 text-gray-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${trendDirection === 'up' ? 'text-green-600' : trendDirection === 'down' ? 'text-red-600' : 'text-gray-600'}`}>
              {trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : '→'} {Math.abs(salesTrend).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground dark:text-gray-300 mt-2">
              Last 30 days vs previous 30
            </p>
          </CardContent>
        </Card>
      </div>
      

      {/* Performance Insights */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Selling Period</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600">
              {bestMonth ? new Date(bestMonth[0]).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground dark:text-gray-300 mt-2">
              {bestMonth ? `${bestMonth[1]} units sold` : 'No data'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Worst Selling Period</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">
              {worstMonth ? new Date(worstMonth[0]).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground dark:text-gray-300 mt-2">
              {worstMonth ? `${worstMonth[1]} units sold` : 'No data'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active / Dead Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground dark:text-gray-300" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{backendActive === null ? (isActive ? 'Active' : 'Dead') : (backendActive ? 'Active' : 'Dead')}</div>
            <p className="text-xs text-muted-foreground dark:text-gray-300 mt-2">Active if sold within {activityMonths} months</p>
          </CardContent>
        </Card>
      </div>

      {/* Product Details and Analytics */}
      {/* Incoming Purchase Orders (standalone full-width card placed below summary/performance) */}
{/*       
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Incoming Purchase Orders
          </CardTitle>
          <CardDescription>Full list of incoming purchase orders for this SKU</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPo ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-muted-foreground">Loading purchase orders...</div>
            </div>
          ) : !poRows || poRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-12 w-12 text-gray-300 mb-3" />
              <div className="text-sm text-muted-foreground">No incoming purchase orders for this SKU</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* PO Summary Stats 
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {poRows.reduce((sum, r) => sum + (r.quantity || 0), 0)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Total Units Expected</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{poRows.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Active Orders</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">
                    {poRows.length > 0 
                      ? new Date(Math.min(...poRows.map(r => new Date(r.transaction_date).getTime()))).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'N/A'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Next Expected</div>
                </div>
              </div>

              {/* PO Table 
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs font-medium text-muted-foreground">
                      <th className="px-4 py-3">Quantity</th>
                      <th className="px-4 py-3">Expected Date</th>
                      <th className="px-4 py-3">Product Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {poRows.map((r, idx) => {
                      const expectedDate = new Date(r.transaction_date)
                      const today = new Date()
                      const daysUntil = Math.ceil((expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                      const isPast = daysUntil < 0
                      const isImminent = daysUntil >= 0 && daysUntil <= 7

                      return (
                        <tr key={`prod-po-full-${idx}`} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                              <span className="font-semibold text-blue-600">{r.quantity}</span>
                              <span className="text-xs text-muted-foreground">units</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {expectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {isPast 
                                  ? `${Math.abs(daysUntil)} days overdue`
                                  : daysUntil === 0 
                                    ? 'Today' 
                                    : `in ${daysUntil} days`}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium">{r.name || 'N/A'}</span>
                              <span className="text-xs text-muted-foreground">SKU: {r.item_id}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      */}

      <Card>
        <CardHeader>
          <div className="w-full flex items-start justify-between">
            <div>
              <CardTitle>Sales History</CardTitle>
              <CardDescription>View product sales over time</CardDescription>
            </div>
            <div className="flex items-center space-x-3">
                {/* Granularity selector */}
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-muted-foreground">Granularity</label>
                  <select
                    value={chartGranularity}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === 'monthly' || v === 'weekly' || v === 'range') setChartGranularity(v as any)
                    }}
                    className="px-2 py-1 rounded border bg-card text-card-foreground text-sm"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="range">Range</option>
                  </select>
                </div>

                {/* Sales view toggle */}
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-muted-foreground">View</label>
                  <select
                    value={salesView}
                    onChange={(e) => setSalesView(e.target.value as any)}
                    className="px-2 py-1 rounded border bg-card text-card-foreground text-sm"
                  >
                    <option value="by-channel">By Channel</option>
                    <option value="overall">Overall</option>
                  </select>
                </div>

                {/* Channel selector appears when By Channel is chosen */}
                {salesView === 'by-channel' && (
                  <div className="flex items-center space-x-2">
                    <label className="text-xs text-muted-foreground">Channel</label>
                    <select
                      value={selectedChannelTrend}
                      onChange={(e) => setSelectedChannelTrend(e.target.value)}
                      className="px-2 py-1 rounded border bg-card text-card-foreground text-sm"
                    >
                      <option value="all">All Channels</option>
                      {Object.keys(channelBreakdown).sort().map(channel => (
                        <option key={channel} value={channel}>{channel}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
          </div>

          {/* Date Range Controls - Show when Range granularity is selected */}
          {chartGranularity === 'range' && (
            <div className="flex items-center space-x-4 mt-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">Start Date:</label>
                <input
                  type="date"
                  value={rangeStartDate}
                  onChange={(e) => setRangeStartDate(e.target.value)}
                  className="px-2 py-1 rounded border bg-card text-card-foreground text-sm"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">End Date:</label>
                <input
                  type="date"
                  value={rangeEndDate}
                  onChange={(e) => setRangeEndDate(e.target.value)}
                  className="px-2 py-1 rounded border bg-card text-card-foreground text-sm"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="showEmptyDays"
                  checked={showEmptyDays}
                  onChange={(e) => setShowEmptyDays(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="showEmptyDays" className="text-sm">
                  Show days with no sales
                </label>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Legend is provided by Recharts inside the chart (using <Legend />). Manual legend removed to avoid duplicates. */}

          {/* Chart area */}
          <div className="w-full h-80">
            {rechartsData && Array.isArray(rechartsData) && rechartsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                {salesView === 'by-channel' ? (
                  (rechartsData && Array.isArray(rechartsData) && rechartsData.length > 0) ? (
                    selectedChannelTrend === 'all' ? (
                      // Stacked chart using chosen granularity (rechartsData)
                      <BarChart data={rechartsData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="xLabel" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, yAxisMax]} />
                        <Tooltip wrapperStyle={{ zIndex: 9999 }} content={<SalesTooltip />} />
                        <Legend />
                        {channelsForChartFiltered.map((ch, idx) => (
                          <Bar key={`bar-${ch}-${idx}`} dataKey={ch} stackId="a" fill={channelHex[ch] || getPaletteColor(idx)} name={ch} />
                        ))}
                      </BarChart>
                    ) : (
                      // Single-channel line using the same granularity data
                      <LineChart data={rechartsData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="xLabel" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, yAxisMax]} />
                        <Tooltip wrapperStyle={{ zIndex: 9999 }} content={<SalesTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey={selectedChannelTrend} stroke={channelHex[selectedChannelTrend] || '#3b82f6'} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground dark:text-gray-300">No historical data</div>
                  )
                ) : (
                  <ComposedChart 
                    data={rechartsData && Array.isArray(rechartsData) ? rechartsData.filter(d => 
                      d && 
                      typeof d === 'object' && 
                      d.xLabel && 
                      typeof d.total === 'number' && 
                      isFinite(d.total)
                    ) : []} 
                    margin={{ top: 20, right: 20, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="xLabel" 
                      tick={{ fontSize: 12 }} 
                      interval={0}
                    />
                    <YAxis domain={[0, Math.max(chartMetrics.maxTotal, 1)]} />
                    <Tooltip wrapperStyle={{ zIndex: 9999 }} content={<SalesTooltip />} />
                    <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="rgba(59,130,246,0.08)" />
                    <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground dark:text-gray-300">No data to display</div>
            )}
          </div>

          {/* X-axis labels provided by the chart's XAxis; removed manual small labels to avoid duplication */}

          {/* Chart Summary */}
          {chartData.length > 0 && (
            <div className="bg-muted p-4 rounded-lg mt-4">
              <h4 className="font-semibold mb-3">Sales Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground dark:text-gray-300">Total Period Sales:</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{chartData.reduce((sum, d) => sum + d.total, 0)} units</div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground dark:text-gray-300">Average Monthly Sales:</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{Math.round(chartData.reduce((sum, d) => sum + d.total, 0) / chartData.length)} units</div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground dark:text-gray-300">Best Month:</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {chartData.length > 0 ? chartData.reduce((max, current) => current.total > max.total ? current : max, chartData[0]).date : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

        {/* Sales Analytics */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Analytics</CardTitle>
            <CardDescription>View sales performance by channel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Sales Summary */}
              <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-2xl font-bold text-primary">{totalSales}</div>
                          <div className="text-sm text-muted-foreground dark:text-gray-300">Total Sales</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{recentSales.reduce((sum, sale) => sum + sale.quantity, 0)}</div>
                          <div className="text-sm text-muted-foreground dark:text-gray-300">Last 7 Days</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-lg font-semibold text-blue-600">{topChannel}</div>
                          <div className="text-sm text-muted-foreground dark:text-gray-300">Top Channel</div>
                        </div>
              </div>
              
              {/* Channel Breakdown */}
              <div className="space-y-3">
                <h4 className="font-semibold">Sales by Channel</h4>

                <div className="w-full">
                  <h5 className="text-sm font-medium text-muted-foreground mb-3">Channel Distribution</h5>
                  {channelPieData.length === 0 ? (
                    <div className="w-full h-64 flex items-center justify-center text-sm text-muted-foreground dark:text-gray-300">No channel data</div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                      {/* Pie Chart - Left Half */}
                      <div className="w-full h-80 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={channelPieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={120}
                              paddingAngle={2}
                            >
                              {channelPieData.map((entry, idx) => (
                                <Cell key={`pie-${idx}`} fill={channelHex[entry.name] || '#94a3b8'} />
                              ))}
                            </Pie>
                            <Tooltip wrapperStyle={{ zIndex: 9999 }} content={<ChannelPieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Legend - Right Half */}
                      <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-2">
                        {channelPieData.map((entry, idx) => (
                          <div key={`legend-${idx}`} className="flex items-center gap-3 text-sm p-2 hover:bg-muted/50 rounded transition-colors">
                            <div 
                              className="w-4 h-4 rounded-sm flex-shrink-0" 
                              style={{ backgroundColor: channelHex[entry.name] || '#94a3b8' }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{entry.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {entry.value} units ({entry.percentage.toFixed(1)}%)
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Channel Sales History moved into the Sales History card so granularity and view are unified. */}
              
              {/* Channel Sales History - moved into the Sales History card's controls above. */}
            </div>
          </CardContent>
        </Card>
          {marketShareData.categoryName && (
          <Card>
            <CardHeader>
              <CardTitle>Market Share Analysis</CardTitle>
              <CardDescription>Performance within {marketShareData.categoryName} category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Market Share Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-sm font-medium text-muted-foreground dark:text-gray-300 mb-2 flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Category Share
                    </div>
                    <div className="text-3xl font-bold text-primary">{marketShareData.marketShare.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground dark:text-gray-300 mt-1">of {marketShareData.categoryName}</div>
                  </div>

                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-sm font-medium text-muted-foreground dark:text-gray-300 mb-2 flex items-center justify-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Overall Share
                    </div>
                    <div className="text-3xl font-bold text-blue-600">
                      {marketShareData.overallMarketShare ? marketShareData.overallMarketShare.toFixed(1) + '%' : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground dark:text-gray-300 mt-1">across all sales</div>
                  </div>

                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-sm font-medium text-muted-foreground dark:text-gray-300 mb-2 flex items-center justify-center gap-2">
                      <Package className="h-4 w-4" />
                      Your Sales
                    </div>
                    <div className="text-2xl font-bold text-green-600">{marketShareData.productTotal.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground dark:text-gray-300 mt-1">units sold</div>
                  </div>

                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-sm font-medium text-muted-foreground dark:text-gray-300 mb-2 flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Category Total
                    </div>
                    <div className="text-2xl font-bold text-purple-600">{marketShareData.categoryTotal.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground dark:text-gray-300 mt-1">total units</div>
                  </div>
                </div>

                {/* Visual Market Share Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Your Share of Category Sales</span>
                    <span className="text-muted-foreground">
                      {marketShareData.productTotal.toLocaleString()} / {marketShareData.categoryTotal.toLocaleString()} units
                    </span>
                  </div>
                  <div className="w-full h-8 bg-muted rounded-lg overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold transition-all duration-500"
                      style={{ width: `${Math.min(marketShareData.marketShare, 100)}%` }}
                    >
                      {marketShareData.marketShare > 5 && `${marketShareData.marketShare.toFixed(1)}%`}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Overall Market Share Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Overall Market Share</span>
                    <span className="text-muted-foreground">
                      {marketShareData.overallMarketShare ? marketShareData.overallMarketShare.toFixed(2) + '%' : '—'} of all sales
                    </span>
                  </div>
                  <div className="w-full h-8 bg-muted rounded-lg overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold transition-all duration-500"
                      style={{ width: `${Math.min(marketShareData.overallMarketShare || 0, 100)}%` }}
                    >
                      {(marketShareData.overallMarketShare || 0) > 3 && `${marketShareData.overallMarketShare?.toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Overall Market Share Info */}
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Market Position</h4>
                  <div className="text-sm text-muted-foreground dark:text-gray-300">
                    Overall market share of <span className="font-semibold text-foreground">{marketShareData.overallMarketShare?.toFixed(2)}%</span> across all sales, 
                    competing with <span className="font-semibold text-foreground">{marketShareData.totalInCategory}</span> products in this category.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  )
}
