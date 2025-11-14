"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { FixedSizeList as List } from 'react-window'

// UI Components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Icons
import { Search, Package, AlertTriangle, Settings, Filter, ArrowUpDown } from "lucide-react"

// Local Components and Utils
import { SimpleUploadButton } from "./simple-upload-button"
import { 
  getProductsCached as getProducts, 
  getCategoriesCached as getCategories, 
  getAvailableSizesAndColorsCached as getAvailableSizesAndColors, 
  getAllSalesCached, 
  analyzeSalesData, 
  getOutOfStockProductsCached as getOutOfStockProducts, 
  getLowStockProductsCached as getLowStockProducts, 
  getDeadStockCached as getDeadStock, 
  getActiveStockCached as getActiveStock 
} from '@/lib/api'
// PO-related API helpers removed from UI build
// import { getPOsBySku, getPOs } from '@/lib/api'
import { notificationManager } from '@/lib/notifications'

// Helper functions
const getStockLevel = (product: Product): number => {
  return product.stock_level ?? product.quantity ?? 0
}

const getSku = (product: Product): string => {
  return product.sku ?? String(product.id ?? '')
}

const getBaselineThreshold = (threshold: number | ''): number => {
  return typeof threshold === 'number' ? threshold : 0
}

const hasRecentSalesActivity = (product: Product, salesData: Map<string, any>): boolean => {
  const sku = getSku(product)
  const salesAnalysis = salesData.get(sku)
  return !!salesAnalysis && !!salesAnalysis.isActive
}

export interface Product {
  id?: number
  name: string
  sku: string
  category_id: number | null
  description: string | null
  // backend uses `stock_level` as the authoritative field; keep `quantity` for older mocks
  quantity?: number
  stock_level?: number
  low_stock_threshold: number
  size: string
  material?: string
  brand?: string
  user_id: number | null
  last_updated: string | null
  category: { id: number; name: string } | null
  // Enhanced fields for inventory management
  // cost_price?: number
  // selling_price?: number
  supplier?: string
  lead_time_days?: number
  color?: string
  season?: string
  collection?: string
  // Sales data for forecasting
  daily_sales_rate?: number
  weekly_sales_rate?: number
  monthly_sales?: number
  days_until_stockout?: number
  reorder_point?: number
  recommended_reorder_qty?: number
  // inventory_value?: number
  // profit_margin?: number
  sales_trend?: 'increasing' | 'stable' | 'decreasing'
}

// Enhanced product type used in the UI after enriching products with sales/forecast fields
type AugmentedProduct = Product & {
  daily_sales_rate?: any
  days_until_stockout?: number
  reorder_point?: number
  recommended_reorder_qty?: number
  // inventory_value?: number
  // profit_margin?: number
  sales_trend?: 'increasing' | 'stable' | 'decreasing'
  sales_analysis?: any
}

export function StockManagement() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [salesData, setSalesData] = useState<Map<string, any>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingSales, setLoadingSales] = useState(false)
  const [salesLoaded, setSalesLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedSize, setSelectedSize] = useState<string>("all")
  // support multiple selected stock filters (e.g. ['out','low'])
  const [stockFilter, setStockFilter] = useState<string[]>(() => {
    const filter = searchParams.get("filter")
    if (!filter) return ['all']
    const parts = String(filter).split(',').map(s => s.trim()).filter(Boolean)
    // sanitize values and default to 'all' if none valid
    const valid = parts.filter(p => ['all','out','low','needed','normal','active','dead'].includes(p))
    return valid.length ? valid : ['all']
  })
  const [stockSort, setStockSort] = useState<string>("none")
  
  // Pagination states
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  
  // Settings states
  const [baselineThreshold, setBaselineThreshold] = useState<number | ''>('')
  const [defaultLeadTime, setDefaultLeadTime] = useState<number | ''>(14)
  const [showSettings, setShowSettings] = useState(false)
  const [activeMonths, setActiveMonths] = useState<number | ''>(6)
  const [deadMonths, setDeadMonths] = useState<number | ''>(6)
  // Sales rate window (days) used to compute backend daily_sales_rate
  // Allow empty string so the input can be cleared for easy typing
  const [salesWindowDays, setSalesWindowDays] = useState<number | ''>('')
  
  // Other states
  const [typeahead, setTypeahead] = useState<string>("")
  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [serverSizes, setServerSizes] = useState<string[] | null>(null)
  const [activeSkus, setActiveSkus] = useState<Set<string>>(new Set())
  const [deadSkus, setDeadSkus] = useState<Set<string>>(new Set())
  const [outOfStockSkus, setOutOfStockSkus] = useState<Set<string>>(new Set())
  const [outOfStockCountDb, setOutOfStockCountDb] = useState<number>(0)
  const [deadStockCountDb, setDeadStockCountDb] = useState<number>(0)
  const [lowStockCountDb, setLowStockCountDb] = useState<number>(0)
  const [activeStockCountDb, setActiveStockCountDb] = useState<number>(0)
  const [countsLoading, setCountsLoading] = useState<boolean>(false)
  // PO-related state removed (PO UI disabled)
  // const [poSkuSet, setPoSkuSet] = useState<Set<string>>(new Set())
  // const [loadingPoSkus, setLoadingPoSkus] = useState<boolean>(false)
  // Global PO filter state
  // const [poWindowDays, setPoWindowDays] = useState<number | ''>('')
  // const [poGlobalSkus, setPoGlobalSkus] = useState<Set<string>>(new Set())
  // const [loadingGlobalPoSkus, setLoadingGlobalPoSkus] = useState<boolean>(false)
  
  const typeaheadTimer = useRef<number | null>(null)
  const rowHeight = 80

  const [settingsLoaded, setSettingsLoaded] = useState(false)

  // Initialize settings from localStorage
  useEffect(() => {
    try {
      const savedThreshold = localStorage.getItem('baselineLowStockThreshold')
      const savedLeadTime = localStorage.getItem('defaultLeadTime')
      const savedActiveMonths = localStorage.getItem('activeDeadMonths')
      
      if (savedThreshold && savedThreshold !== '') {
        setBaselineThreshold(Number(savedThreshold))
      } else {
        setBaselineThreshold(10) // Default value
      }
      
      if (savedLeadTime && savedLeadTime !== '') {
        setDefaultLeadTime(Number(savedLeadTime))
      } else {
        setDefaultLeadTime(14) // Default 14 days
      }
      const savedSalesWindow = localStorage.getItem('salesWindowDays')
      if (savedSalesWindow && savedSalesWindow !== '') {
        setSalesWindowDays(Number(savedSalesWindow))
      } else {
        setSalesWindowDays(180)
      }
      if (savedActiveMonths && savedActiveMonths !== '') {
        const v = Number(savedActiveMonths)
        if (!isNaN(v) && v > 0) {
          setActiveMonths(v)
          setDeadMonths(v)
        }
      } else {
        setActiveMonths(6)
        setDeadMonths(6)
      }
      setSettingsLoaded(true)
      // PO window setting removed from UI; skip reading savedPoWindow
      // const savedPoWindow = localStorage.getItem('poWindowDays')
      // if (savedPoWindow && savedPoWindow !== '') {
      //   setPoWindowDays(Number(savedPoWindow))
      // } else {
      //   setPoWindowDays(15)
      // }
    } catch (e) {
      setBaselineThreshold(10)
      setDefaultLeadTime(14)
      setSettingsLoaded(true)
    }
  }, [])
  
  // Load data on component mount - wait for settings to be loaded first
  useEffect(() => {
    if (settingsLoaded) {
      loadData()
    }
  }, [settingsLoaded])

  // Load sales data lazily: only when required (active/dead filters) or when user requests it
  useEffect(() => {
    if (products.length === 0) return
    if ((stockFilter.includes('active') || stockFilter.includes('dead')) && !salesLoaded && !loadingSales) {
      loadSalesData().catch(() => {})
    }
  }, [products.length, stockFilter, salesLoaded, loadingSales])
  const uniqueSizes = useMemo(() => {
    if (serverSizes && serverSizes.length) return serverSizes
    const defaultSizes = ['XS','S','M','L','XL','XXL']
    const sizesSet = new Set<string>()
    for (const p of products) {
      if (!p?.size) continue
      const raw = String(p.size).trim()
      if (raw.includes(',')) {
        raw.split(',').map(s => s.trim()).filter(Boolean).forEach(s => sizesSet.add(s))
      } else {
        sizesSet.add(raw)
      }
    }
    const arr = Array.from(sizesSet).sort()
    return arr.length ? arr : defaultSizes
  }, [products, serverSizes])

  const enhancedProducts = useMemo(() => {
    return products.map(p => {
      const sku = getSku(p)
      const salesAnalysis = salesData.get(sku)
      
  let dailySalesRate = 0
  let daysUntilStockout = 999
      let salesTrend: 'increasing' | 'stable' | 'decreasing' = 'stable'

      // Prefer backend-provided daily_sales_rate when available (more authoritative)
      // Use only backend-provided daily_sales_rate. Do not fall back to client-side analysis for displayed rates.
      const stockLevelForCalc = getStockLevel(p)
      if (typeof (p as any).daily_sales_rate === 'number') {
        dailySalesRate = Number((p as any).daily_sales_rate) || 0
        daysUntilStockout = dailySalesRate > 0 ? Math.floor(stockLevelForCalc / dailySalesRate) : 999
      } else {
        // No backend rate available: leave dailySalesRate as 0 and daysUntilStockout as large number
        dailySalesRate = 0
        daysUntilStockout = 999
      }

      // If there's zero stock, days until stockout should be zero regardless of sales rate availability
      if (stockLevelForCalc === 0) {
        daysUntilStockout = 0
      }
      
  const stockLevel = getStockLevel(p)
      const leadTime = (typeof p.lead_time_days === 'number') ? p.lead_time_days : (typeof defaultLeadTime === 'number' ? defaultLeadTime : 14)
      const baselineSafety = p.low_stock_threshold ?? 0
      // Reorder point = baseline safety stock + expected consumption during lead time
      const reorderPoint = Math.ceil(baselineSafety + (leadTime * dailySalesRate))
      const recommendedReorderQty = Math.ceil(dailySalesRate * 30)
      // price-derived fields removed: inventoryValue and profitMargin

      return {
        ...p,
        // keep or populate daily_sales_rate for easy access in UI
        daily_sales_rate: (p as any).daily_sales_rate ?? dailySalesRate,
        days_until_stockout: daysUntilStockout,
        reorder_point: reorderPoint,
        recommended_reorder_qty: recommendedReorderQty,
  // inventory_value and profit_margin removed
        sales_trend: salesTrend,
        sales_analysis: salesAnalysis
      }
    })
  }, [products, defaultLeadTime, salesData]) as AugmentedProduct[]

  // Apply all filters to products
  const filteredProducts = useMemo(() => {
  let filtered: AugmentedProduct[] = enhancedProducts

    if (searchTerm) {
      const query = searchTerm.toLowerCase()
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.brand?.toLowerCase().includes(query) ||
        p.category?.name.toLowerCase().includes(query) ||
        p.supplier?.toLowerCase().includes(query)
      )
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(p => 
        String(p.category_id) === selectedCategory || 
        p.category?.name === categories.find(c => c.id.toString() === selectedCategory)?.name
      )
    }

    if (selectedSize !== "all") {
      filtered = filtered.filter(p => 
        String(p.size ?? '').toLowerCase() === String(selectedSize).toLowerCase()
      )
    }

    if (!stockFilter.includes("all")) {
      const baselineVal = getBaselineThreshold(baselineThreshold)
      filtered = filtered.filter(p => {
        const stock = getStockLevel(p)
        const threshold = p.low_stock_threshold ?? baselineVal
        // Allow multiple selected stock filters: product must match ALL selected filters (AND semantics)
        const matches = stockFilter.every(f => {
          switch (f) {
            case "out":
              if (outOfStockSkus && outOfStockSkus.size > 0) return outOfStockSkus.has(getSku(p))
              return stock === 0
            case "needed":
              return stock <= (typeof p.reorder_point === 'number' ? p.reorder_point : (p.low_stock_threshold ?? getBaselineThreshold(baselineThreshold)))
            case "low":
              return stock > 0 && stock <= threshold
            case "normal":
              return stock > threshold
            case "active":
              if (activeSkus && activeSkus.size > 0) return activeSkus.has(getSku(p))
              return hasRecentSalesActivity(p, salesData)
            case "dead":
              if (deadSkus && deadSkus.size > 0) return deadSkus.has(getSku(p))
              return !hasRecentSalesActivity(p, salesData)
            case "po":
              // PO filter disabled in UI
              return false
            default:
              return false
          }
        })
        return matches
      })
    }

    if (stockSort !== "none") {
      filtered = [...filtered].sort((a, b) => {
        const stockA = getStockLevel(a)
        const stockB = getStockLevel(b)
        if (stockSort === "asc") {
          return stockA - stockB
        } else if (stockSort === "desc") {
          return stockB - stockA
        }
        return 0
      })
    }

    // If the user requested the backend 'out' or 'dead' filter and the backend-provided SKU set
    // is loaded, include placeholder rows for SKUs that the backend reports but which are not
    // present in the currently loaded `products` list. We only append placeholders when no other
    // client-side filters (search, category, size) are active, because placeholders can't satisfy
    // those filters.
    if (!searchTerm && selectedCategory === 'all' && selectedSize === 'all') {
  if (stockFilter.length === 1 && stockFilter[0] === 'out' && outOfStockSkus && outOfStockSkus.size > 0) {
        const existingSkus = new Set(filtered.map(p => getSku(p)))
        const missingSkus = Array.from(outOfStockSkus).filter(sku => !existingSkus.has(sku))
        if (missingSkus.length > 0) {
          const placeholders = missingSkus.map(sku => ({
            id: undefined,
            sku,
            name: sku,
            stock_level: 0,
            low_stock_threshold: getBaselineThreshold(baselineThreshold),
            category: { id: 0, name: 'Unknown' },
            // Augmented fields expected by the enhanced products pipeline
            daily_sales_rate: 0,
            days_until_stockout: 999,
            reorder_point: getBaselineThreshold(baselineThreshold),
            recommended_reorder_qty: 0,
            sales_trend: 'stable' as const,
            sales_analysis: undefined
          })) as unknown as AugmentedProduct[]
          filtered = [...filtered, ...placeholders]
        }
      }

  if (stockFilter.length === 1 && stockFilter[0] === 'dead' && deadSkus && deadSkus.size > 0) {
        const existingSkus = new Set(filtered.map(p => getSku(p)))
        const missingSkus = Array.from(deadSkus).filter(sku => !existingSkus.has(sku))
        if (missingSkus.length > 0) {
          const placeholders = missingSkus.map(sku => ({
            id: undefined,
            sku,
            name: sku,
            stock_level: 0,
            low_stock_threshold: getBaselineThreshold(baselineThreshold),
            category: { id: 0, name: 'Unknown' },
            // Augmented fields expected by the enhanced products pipeline
            daily_sales_rate: 0,
            days_until_stockout: 999,
            reorder_point: getBaselineThreshold(baselineThreshold),
            recommended_reorder_qty: 0,
            sales_trend: 'stable' as const,
            sales_analysis: undefined
          })) as unknown as AugmentedProduct[]
          filtered = [...filtered, ...placeholders]
        }
      }
    }

    return filtered
  }, [enhancedProducts, searchTerm, selectedCategory, selectedSize, stockFilter, stockSort, baselineThreshold, categories, activeSkus, deadSkus, salesData])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, selectedCategory, selectedSize, stockFilter, stockSort, baselineThreshold])

  // Pagination calculations
  const pageCount = Math.ceil(filteredProducts.length / pageSize)
  const currentPageItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    return filteredProducts.slice(startIndex, endIndex)
  }, [filteredProducts, page, pageSize])

  // PO presence fetching removed - UI no longer shows incoming PO badges
  /*
  // Fetch PO presence for SKUs visible on the current page
  useEffect(() => {
    let cancelled = false
    async function fetchPoFlags() {
      try {
        setLoadingPoSkus(true)
        const now = new Date().getTime()
        const dayMs = 1000 * 60 * 60 * 24
        const recentThresholdDays = (typeof poWindowDays === 'number' && poWindowDays > 0) ? poWindowDays : 15
        const nextSet = new Set<string>()

        // Fetch PO rows for each SKU on the current page (bounded to pageSize)
        const skus = Array.from(new Set(currentPageItems.map(p => getSku(p))))
        // ... fetch logic omitted
        if (!cancelled) setPoSkuSet(nextSet)
      } catch (e) {
        console.warn('Failed to fetch PO flags for visible SKUs', e)
      } finally {
        if (!cancelled) setLoadingPoSkus(false)
      }
    }

    if (currentPageItems.length > 0) fetchPoFlags()
    else setPoSkuSet(new Set())

    return () => { cancelled = true }
  }, [currentPageItems])
  */

  // Load sales data from API
  const loadSalesData = async () => {
    try {
      setLoadingSales(true)
      const sales = await getAllSalesCached()
      
      // Group sales by SKU and analyze each
      const salesByProduct = new Map<string, any>()
      
      // Group sales by SKU
      const salesGrouped: { [sku: string]: any[] } = {}
      for (const sale of sales) {
        if (!salesGrouped[sale.sku]) {
          salesGrouped[sale.sku] = []
        }
        salesGrouped[sale.sku].push(sale)
      }
      
      // Analyze each product's sales
      for (const [sku, productSales] of Object.entries(salesGrouped)) {
        const analysis = analyzeSalesData(productSales)
        salesByProduct.set(sku, analysis)
      }
      
      setSalesData(salesByProduct)
  setSalesLoaded(true)
      console.log('Sales data loaded:', salesByProduct.size, 'products with sales')
    } catch (error) {
      console.error('Failed to load sales data:', error)
      // Don't throw - allow the component to work without sales data
    } finally {
      setLoadingSales(false)
    }
  }

  // Helper to ensure sales data is loaded (used by button and filter changes)
  const ensureSalesDataLoaded = async () => {
    if (salesLoaded || loadingSales) return
    try {
      await loadSalesData()
    } catch (e) {
      // swallow - loadSalesData already logs
    }
  }

  // Ensure backend-provided SKU sets are loaded when user requests backend-driven filters
  const ensureOutOfStockSkusLoaded = async () => {
    if (outOfStockSkus && outOfStockSkus.size > 0) return
    try {
      const items = await getOutOfStockProducts()
      setOutOfStockCountDb(Array.isArray(items) ? items.length : 0)
      const os = new Set<string>((Array.isArray(items) ? items : []).map((it: any) => String(it.raw_id)))
      setOutOfStockSkus(os)
    } catch (e) {
      console.warn('Failed to load out-of-stock SKUs from backend', e)
      setOutOfStockSkus(new Set())
    }
  }

  const ensureActiveSkusLoaded = async () => {
    if (activeSkus && activeSkus.size > 0) return
    try {
      const items = await getActiveStock(typeof activeMonths === 'number' ? activeMonths : undefined)
      setActiveStockCountDb(Array.isArray(items) ? items.length : 0)
      const as = new Set<string>((Array.isArray(items) ? items : []).map((it: any) => String(it.raw_id)))
      setActiveSkus(as)
    } catch (e) {
      console.warn('Failed to load active SKUs from backend', e)
      setActiveSkus(new Set())
    }
  }

  const ensureDeadSkusLoaded = async () => {
    if (deadSkus && deadSkus.size > 0) return
    try {
      const items = await getDeadStock(typeof deadMonths === 'number' ? deadMonths : undefined)
      setDeadStockCountDb(Array.isArray(items) ? items.length : 0)
      const ds = new Set<string>((Array.isArray(items) ? items : []).map((it: any) => String(it.raw_id)))
      setDeadSkus(ds)
    } catch (e) {
      console.warn('Failed to load dead SKUs from backend', e)
      setDeadSkus(new Set())
    }
  }

  // Load global PO SKUs within configured PO window (used for filtering)
  // const ensurePoSkusLoaded = async () => {
  //   if (poGlobalSkus && poGlobalSkus.size > 0) return
  //   try {
  //     setLoadingGlobalPoSkus(true)
  //     const daysParam = typeof poWindowDays === 'number' && poWindowDays > 0 ? poWindowDays : undefined
  //     const allPos = await getPOs(500, daysParam)
  //     const now = Date.now()
  //     const dayMs = 1000 * 60 * 60 * 24
  //     const threshold = typeof poWindowDays === 'number' && poWindowDays > 0 ? poWindowDays : 15
  //     const recentSkus = new Set<string>()
  //     for (const r of (Array.isArray(allPos) ? allPos : [])) {
  //       try {
  //         const t = new Date(r.transaction_date).getTime()
  //         const daysDiff = Math.floor((now - t) / dayMs)
  //         if (daysDiff <= threshold) {
  //           // prefer item_id, fall back to name if item_id missing
  //           const id = r.item_id ?? r.name ?? ''
  //           recentSkus.add(String(id))
  //         }
  //       } catch (e) {
  //         // ignore malformed rows
  //       }
  //     }
  //     setPoGlobalSkus(recentSkus)
  //   } catch (e) {
  //     console.warn('Failed to load global PO SKUs', e)
  //     setPoGlobalSkus(new Set())
  //   } finally {
  //     setLoadingGlobalPoSkus(false)
  //   }
  // }

  // // Refresh global PO SKUs when the configured PO window changes
  // useEffect(() => {
  //   // clear existing global set so callers will reload
  //   setPoGlobalSkus(new Set())
  //   // kick off reload if user currently has PO filter active
  //   if (stockFilter.length === 1 && stockFilter[0] === 'po') {
  //     ensurePoSkusLoaded().catch(() => {})
  //   }
  // }, [poWindowDays])

  // Centralized handler for setting stock filter that enforces backend-driven sets
  const handleSetStockFilter = async (value: string) => {
    // Toggle value in the stockFilter array
    const current = new Set(stockFilter)
    if (current.has('all')) current.delete('all')

    if (current.has(value)) {
      current.delete(value)
    } else {
      // ensure backend sets for backend-driven filters
      if (value === 'out') await ensureOutOfStockSkusLoaded()
      if (value === 'active') await ensureActiveSkusLoaded()
      if (value === 'dead') await ensureDeadSkusLoaded()
      // if (value === 'po') await ensurePoSkusLoaded()
      current.add(value)
    }

    // If nothing selected, default to 'all'
    const next = current.size ? Array.from(current) : ['all']
    setStockFilter(next)
  }

  // Remove a specific filter (stock filter entry, category, size, or search)
  const removeFilter = (filterKey: string, filterType: 'stock' | 'category' | 'size' | 'search') => {
    if (filterType === 'stock') {
      const next = stockFilter.filter(f => f !== filterKey)
      setStockFilter(next.length ? next : ['all'])
      return
    }
    if (filterType === 'category') {
      setSelectedCategory('all')
      return
    }
    if (filterType === 'size') {
      setSelectedSize('all')
      return
    }
    if (filterType === 'search') {
      setSearchTerm('')
      return
    }
  }

  const loadData = async (suppressLoading: boolean = false) => {
    try {
      if (!suppressLoading) {
        setLoading(true)
      }
      setLoadError(null)
      const filters: any = {}
      if (selectedCategory !== 'all') {
        const cat = categories.find(c => c.id.toString() === selectedCategory)
        if (cat) filters.category = cat.name
      }
      if (selectedSize !== 'all') filters.size = selectedSize
      const [productsData, categoriesData] = await Promise.all([
  getProducts(filters, typeof salesWindowDays === 'number' ? salesWindowDays : undefined),
  getCategories()
      ])
      
      const normalizedCats = (categoriesData || [])
        .map((c: any) => {
          if (c == null) return null
          const id = (c.id ?? c.category_id ?? c.categoryId ?? null)
          if (id === null || id === undefined) return null
          return { id: Number(id), name: c.name ?? c.category_name ?? 'Unknown' }
        })
        .filter((x): x is { id: number; name: string } => x != null && !isNaN(x.id))
      setCategories(normalizedCats)
      const catById = new Map<number, { id: number; name: string }>()
      for (const c of normalizedCats) catById.set(c.id, c)

      const productsWithCategory = (productsData || []).map((p: any) => {
        let cat = null
        if (p == null) cat = null
        else if (typeof p.category === 'string') {
          cat = { id: null, name: p.category }
        } else if (p?.category?.name) {
          cat = p.category
        } else if (p?.category_id) {
          cat = catById.get(Number(p.category_id)) ?? null
        }
        return { ...p, category: cat }
      })

      setProducts(productsWithCategory)

      const stockItems = (productsWithCategory || [])
        .filter(p => p != null && (((p as any).sku && String((p as any).sku).length > 0) || (p as any).id !== undefined))
        .map(p => ({
          id: String((p as any).sku ?? (p as any).id ?? ''),
          name: p?.name ?? 'Unknown',
          currentStock: getStockLevel(p as Product),
          threshold: p?.low_stock_threshold ?? getBaselineThreshold(baselineThreshold),
          category: p?.category?.name || 'Unknown'
        }))
      
      if (productsData.length > 0) {
        setTimeout(() => {
          notificationManager.checkStockLevels(stockItems)
        }, 2000)
      }
      
      // Do not await sales data on initial load; fetch in background for faster render
      if (!suppressLoading) {
        loadSalesData().catch(() => {})
      }
    } catch (error) {
      console.error('Failed to load inventory data:', error)
      setLoadError((error as any)?.message || String(error))
    } finally {
      if (!suppressLoading) {
        setLoading(false)
      }
    }
  }

  // When filters change, reload data in the background so the table remains visible
  useEffect(() => {
    loadData(true)
  }, [selectedCategory, selectedSize])

  // Fetch server-provided facets (sizes/colors) from backend to populate dropdowns
  useEffect(() => {
    let cancelled = false
    async function fetchFacets() {
      try {
  const { sizes } = await getAvailableSizesAndColors()
        if (cancelled) return
        setServerSizes(sizes)
      } catch (err) {
        // If facet fetch fails, keep local extraction logic — do not block UI
        console.warn('Failed to fetch sizes/colors from server:', err)
        setServerSizes(null)
      }
    }
    fetchFacets()
    return () => { cancelled = true }
  }, [])

  // Typeahead debounce and suggestions (client-side)
  useEffect(() => {
    if (typeaheadTimer.current) window.clearTimeout(typeaheadTimer.current)
    if (!typeahead) {
      setSuggestions([])
      return
    }
    typeaheadTimer.current = window.setTimeout(() => {
      const q = typeahead.toLowerCase()
      const matches = products.filter(p =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q)
      )
      setSuggestions(matches.slice(0, 10))
    }, 250)
    return () => { if (typeaheadTimer.current) window.clearTimeout(typeaheadTimer.current) }
  }, [typeahead, products])

  // Calculate business-critical summary stats
  const totalProducts = products.length
  const outOfStockCount = enhancedProducts.filter(p => getStockLevel(p) === 0).length
  const urgentReorderCount = enhancedProducts.filter(p => p.days_until_stockout! < 7).length
  // Consider a product needing reorder when current stock is <= its reorder_point (which incorporates lead time)
  const needsReorderCount = enhancedProducts.filter(p =>
    getStockLevel(p) <= (typeof p.reorder_point === 'number' ? p.reorder_point : (p.low_stock_threshold ?? getBaselineThreshold(baselineThreshold)))
  ).length
  const stockoutRisk = enhancedProducts.filter(p => p.days_until_stockout! < 14).length
  const activeStockCount = enhancedProducts.filter(p => hasRecentSalesActivity(p, salesData)).length
  const deadStockCount = enhancedProducts.filter(p => !hasRecentSalesActivity(p, salesData)).length

  // Fetch backend-driven counts for the BI cards
  useEffect(() => {
    let cancelled = false
    async function loadCounts() {
      try {
        setCountsLoading(true)
        // Out of stock (backend-provided set)
        const outItems = await getOutOfStockProducts()
        if (cancelled) return
        setOutOfStockCountDb(Array.isArray(outItems) ? outItems.length : 0)
        try {
          const os = new Set<string>((Array.isArray(outItems) ? outItems : []).map((it: any) => String(it.raw_id)))
          setOutOfStockSkus(os)
        } catch (e) {
          setOutOfStockSkus(new Set())
        }

  // Dead stock (backend returns items; default 6 months)
  const deadItems = await getDeadStock(typeof deadMonths === 'number' ? deadMonths : undefined)
        if (cancelled) return
        setDeadStockCountDb(Array.isArray(deadItems) ? deadItems.length : 0)
        // populate dead SKUs set for server-driven filtering
        try {
          const ds = new Set<string>((Array.isArray(deadItems) ? deadItems : []).map((it: any) => String(it.raw_id)))
          setDeadSkus(ds)
        } catch (e) {
          setDeadSkus(new Set())
        }

        // Low stock based on baseline threshold
        const threshold = getBaselineThreshold(baselineThreshold)
        const lowItems = await getLowStockProducts(threshold)
        if (cancelled) return
        setLowStockCountDb(Array.isArray(lowItems) ? lowItems.length : 0)

        // Active = use backend /stock/active for authoritative active SKU count
        try {
          const activeItems = await getActiveStock(typeof activeMonths === 'number' ? activeMonths : undefined)
          if (cancelled) return
          setActiveStockCountDb(Array.isArray(activeItems) ? activeItems.length : 0)
          const as = new Set<string>((Array.isArray(activeItems) ? activeItems : []).map((it: any) => String(it.raw_id)))
          setActiveSkus(as)
        } catch (e) {
          // Fall back to previous heuristic if backend call fails: derive active SKUs as all SKUs minus dead SKUs
          setActiveStockCountDb(totalProducts - (Array.isArray(deadItems) ? deadItems.length : 0))
          try {
            const allSkus = (products || []).map(p => getSku(p))
            const fallbackActive = new Set<string>(allSkus.filter(sku => !deadSkus.has(sku)))
            setActiveSkus(fallbackActive)
          } catch (err) {
            setActiveSkus(new Set())
          }
        }
      } catch (err) {
        console.warn('Failed to load BI counts:', err)
      } finally {
        if (!cancelled) setCountsLoading(false)
      }
    }

    // Load counts when products or baseline threshold change
    loadCounts()
    return () => { cancelled = true }
  }, [products.length, baselineThreshold, activeMonths, deadMonths])

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading inventory...</div>
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="text-red-600 font-medium mb-2">Failed to load inventory</div>
        <div className="text-sm text-muted-foreground">{loadError}</div>
        <div className="mt-4">
          <Button onClick={() => loadData()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Clothing Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage {totalProducts.toLocaleString()} SKUs • 
            Default lead time: {defaultLeadTime} days • 
            Baseline threshold: {typeof baselineThreshold === 'number' ? baselineThreshold : 'Not set'}
            {(!(stockFilter.length === 1 && stockFilter[0] === 'all') || stockSort !== "none") && (
              <span className="ml-2 text-blue-600 font-medium">
                • Filter active: {
                  !(stockFilter.length === 1 && stockFilter[0] === 'all') ? (
                    stockFilter.map((f, i) => (
                      f === 'out' ? 'Out of stock' :
                      f === 'low' ? 'Low stock' :
                      f === 'normal' ? 'Normal stock' :
                      f === 'active' ? 'Active stock' :
                      f === 'dead' ? 'Dead stock' : f
                    )).join(', ') + (stockSort !== "none" ? ` (${stockSort === "asc" ? "Low to High" : "High to Low"})` : "")
                  ) : (
                    stockSort !== "none" ? `Sorted ${stockSort === "asc" ? "Low to High" : "High to Low"}` : ""
                  )
                }
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => ensureSalesDataLoaded()}
            disabled={salesLoaded || loadingSales}
            className="flex items-center gap-2"
            title={salesLoaded ? 'Sales insights loaded' : 'Load sales insights (faster render if skipped)'}
          >
            {loadingSales ? 'Loading...' : (salesLoaded ? 'Sales ready' : 'Load sales insights')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Inventory Settings
            </CardTitle>
            <CardDescription>
              Configure default values for inventory calculations and thresholds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Baseline Low Stock Threshold */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Baseline Low-Stock Threshold</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-md overflow-hidden">
                    <button
                      className="px-2 py-1 bg-muted hover:bg-muted/80"
                      onClick={() => {
                        const cur = typeof baselineThreshold === 'number' ? baselineThreshold : 0
                        const v = Math.max(0, cur - 1)
                        setBaselineThreshold(v)
                        try { localStorage.setItem('baselineLowStockThreshold', String(v)) } catch (e) {}
                      }}
                    >-</button>
                    <Input
                      type="number"
                      min={0}
                      value={baselineThreshold}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') {
                          setBaselineThreshold('')
                          try { localStorage.setItem('baselineLowStockThreshold', '') } catch (e) {}
                          return
                        }
                        const v = Math.max(0, Number(raw))
                        setBaselineThreshold(v)
                        try { localStorage.setItem('baselineLowStockThreshold', String(v)) } catch (e) {}
                      }}
                      className="w-20 text-center border-0"
                    />
                    <button
                      className="px-2 py-1 bg-muted hover:bg-muted/80"
                      onClick={() => {
                        const cur = typeof baselineThreshold === 'number' ? baselineThreshold : 0
                        const v = cur + 1
                        setBaselineThreshold(v)
                        try { localStorage.setItem('baselineLowStockThreshold', String(v)) } catch (e) {}
                      }}
                    >+</button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={typeof baselineThreshold === 'number' ? baselineThreshold : 0}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setBaselineThreshold(v)
                      try { localStorage.setItem('baselineLowStockThreshold', String(v)) } catch (e) {}
                    }}
                    className="flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  {[5,10,15,20].map(preset => (
                    <button
                      key={preset}
                      className="px-3 py-1 rounded bg-accent/10 hover:bg-accent/20 text-sm"
                      onClick={() => {
                        setBaselineThreshold(preset)
                        try { localStorage.setItem('baselineLowStockThreshold', String(preset)) } catch (e) {}
                      }}
                    >{preset}</button>
                  ))}
                </div>
                {/* Apply to all SKUs moved to unified Save Settings button below */}
                <p className="text-xs text-muted-foreground">Used when a product's low-stock threshold is not set.</p>
              </div>

              {/* (Data source selector removed — backend-only) */}

              {/* Default Lead Time */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Default Lead Time (Days)</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-md overflow-hidden">
                    <button
                      className="px-2 py-1 bg-muted hover:bg-muted/80"
                      onClick={() => {
                        const cur = typeof defaultLeadTime === 'number' ? defaultLeadTime : 1
                        const v = Math.max(1, cur - 1)
                        setDefaultLeadTime(v)
                        try { localStorage.setItem('defaultLeadTime', String(v)) } catch (e) {}
                      }}
                    >-</button>
                    <Input
                      type="number"
                      min={1}
                      value={defaultLeadTime}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') {
                          setDefaultLeadTime('')
                          try { localStorage.setItem('defaultLeadTime', '') } catch (e) {}
                          return
                        }
                        const v = Math.max(1, Number(raw))
                        setDefaultLeadTime(v)
                        try { localStorage.setItem('defaultLeadTime', String(v)) } catch (e) {}
                      }}
                      className="w-20 text-center border-0"
                    />
                    <button
                      className="px-2 py-1 bg-muted hover:bg-muted/80"
                      onClick={() => {
                        const cur = typeof defaultLeadTime === 'number' ? defaultLeadTime : 1
                        const v = cur + 1
                        setDefaultLeadTime(v)
                        try { localStorage.setItem('defaultLeadTime', String(v)) } catch (e) {}
                      }}
                    >+</button>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={90}
                    value={typeof defaultLeadTime === 'number' ? defaultLeadTime : 1}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setDefaultLeadTime(v)
                      try { localStorage.setItem('defaultLeadTime', String(v)) } catch (e) {}
                    }}
                    className="flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  {[7,14,21,30].map(preset => (
                    <button
                      key={preset}
                      className="px-3 py-1 rounded bg-accent/10 hover:bg-accent/20 text-sm"
                      onClick={() => {
                        setDefaultLeadTime(preset)
                        try { localStorage.setItem('defaultLeadTime', String(preset)) } catch (e) {}
                      }}
                    >{preset}d</button>
                  ))}
                </div>
                {/* Quick apply removed - use Save Settings to apply to all SKUs */}
                <p className="text-xs text-muted-foreground">Time from order to delivery. Used for reorder point calculations.</p>
              </div>

              {/* Sales Rate Window */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Sales Rate Window (days)</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center border rounded-md overflow-hidden">
                        <button
                          className="px-2 py-1 bg-muted hover:bg-muted/80"
                          onClick={() => {
                            const cur = typeof salesWindowDays === 'number' ? salesWindowDays : 1
                            const v = Math.max(1, cur - 1)
                            setSalesWindowDays(v)
                          }}
                        >-</button>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={salesWindowDays}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') {
                              setSalesWindowDays('')
                              return
                            }
                            const v = Math.max(1, Number(raw))
                            setSalesWindowDays(v)
                          }}
                          className="w-24 text-center border-0"
                        />
                        <button
                          className="px-2 py-1 bg-muted hover:bg-muted/80"
                          onClick={() => {
                            const cur = typeof salesWindowDays === 'number' ? salesWindowDays : 1
                            const v = cur + 1
                            setSalesWindowDays(v)
                          }}
                        >+</button>
                      </div>
                      <div className="text-sm text-muted-foreground">Window to average sales for rate calculation</div>
                    </div>

                    <div className="mt-3">
                      <input
                        type="range"
                        min={1}
                        max={365}
                        step={1}
                        value={typeof salesWindowDays === 'number' ? salesWindowDays : 1}
                        onChange={(e) => {
                          const v = Math.max(1, Number(e.target.value) || 1)
                          setSalesWindowDays(v)
                        }}
                        className="w-full"
                      />
                    </div>

                    <div className="flex gap-2 mt-2">
                      { [7,14,30,90].map(preset => (
                        <button
                          key={preset}
                          className="px-3 py-1 rounded bg-accent/10 hover:bg-accent/20 text-sm"
                          onClick={() => {
                            setSalesWindowDays(preset)
                          }}
                        >{preset}d</button>
                      )) }
                    </div>
                  </div>
                </div>
              </div>
              {/* Active / Dead months setting */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Active / Dead Window (Months)</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-md overflow-hidden">
                    <button
                      className="px-2 py-1 bg-muted hover:bg-muted/80"
                      onClick={() => {
                        const cur = typeof activeMonths === 'number' ? activeMonths : 1
                        const v = Math.max(1, cur - 1)
                        setActiveMonths(v)
                        setDeadMonths(v)
                        try { localStorage.setItem('activeDeadMonths', String(v)) } catch (err) {}
                      }}
                    >-</button>
                    <Input
                      type="number"
                      min={1}
                      value={activeMonths}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') {
                          setActiveMonths('')
                          setDeadMonths('')
                          try { localStorage.setItem('activeDeadMonths', '') } catch (err) {}
                          return
                        }
                        const v = Math.max(1, Number(raw))
                        setActiveMonths(v)
                        setDeadMonths(v)
                        try { localStorage.setItem('activeDeadMonths', String(v)) } catch (err) {}
                      }}
                      className="w-20 text-center"
                    />
                    <button
                      className="px-2 py-1 bg-muted hover:bg-muted/80"
                      onClick={() => {
                        const cur = typeof activeMonths === 'number' ? activeMonths : 1
                        const v = cur + 1
                        setActiveMonths(v)
                        setDeadMonths(v)
                        try { localStorage.setItem('activeDeadMonths', String(v)) } catch (err) {}
                      }}
                    >+</button>
                  </div>
                  <div className="text-sm text-muted-foreground">Months to consider an SKU active (no sales within this window = dead)</div>
                </div>
                <div className="flex gap-2">
                  {[3,6,9,12].map(preset => (
                    <button
                      key={preset}
                      className="px-3 py-1 rounded bg-accent/10 hover:bg-accent/20 text-sm"
                      onClick={() => {
                        setActiveMonths(preset)
                        setDeadMonths(preset)
                        try { localStorage.setItem('activeDeadMonths', String(preset)) } catch (err) {}
                      }}
                    >{preset}m</button>
                  ))}
                </div>
              </div>
              {/* PO Window
              <div className="space-y-3">
                <label className="text-sm font-medium">PO Window (Days)</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-md overflow-hidden">
                    <button
                      className="px-2 py-1 bg-muted hover:bg-muted/80"
                      onClick={() => {
                        const cur = typeof poWindowDays === 'number' ? poWindowDays : 15
                        const v = Math.max(1, cur - 1)
                        setPoWindowDays(v)
                        try { localStorage.setItem('poWindowDays', String(v)) } catch (e) {}
                      }}
                    >-</button>
                    <Input
                      type="number"
                      min={1}
                      value={poWindowDays}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') {
                          setPoWindowDays('')
                          try { localStorage.setItem('poWindowDays', '') } catch (e) {}
                          return
                        }
                        const v = Math.max(1, Number(raw))
                        setPoWindowDays(v)
                        try { localStorage.setItem('poWindowDays', String(v)) } catch (e) {}
                      }}
                      className="w-20 text-center"
                    />
                    <button
                      className="px-2 py-1 bg-muted hover:bg-muted/80"
                      onClick={() => {
                        const cur = typeof poWindowDays === 'number' ? poWindowDays : 15
                        const v = cur + 1
                        setPoWindowDays(v)
                        try { localStorage.setItem('poWindowDays', String(v)) } catch (e) {}
                      }}
                    >+</button>
                  </div>
                  <div className="text-sm text-muted-foreground">Days to consider a PO as 'recent' for filtering</div>
                </div>
                <div className="flex gap-2">
                  {[7,15,30,60].map(preset => (
                    <button
                      key={preset}
                      className="px-3 py-1 rounded bg-accent/10 hover:bg-accent/20 text-sm"
                      onClick={() => {
                        setPoWindowDays(preset)
                        try { localStorage.setItem('poWindowDays', String(preset)) } catch (e) {}
                      }}
                    >{preset}d</button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Used to define what 'Incoming PO' means when filtering or showing PO badges.</p>
              </div>
              */}
            </div>
          </CardContent>
          <div className="p-4 border-t flex justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button variant="default" size="sm" onClick={async () => {
              // Persist all settings and apply to products
              try {
                localStorage.setItem('baselineLowStockThreshold', typeof baselineThreshold === 'number' ? String(baselineThreshold) : '')
                localStorage.setItem('defaultLeadTime', String(defaultLeadTime))
                // Only save salesWindowDays if it's a valid number
                if (typeof salesWindowDays === 'number' && salesWindowDays > 0) {
                  localStorage.setItem('salesWindowDays', String(salesWindowDays))
                } else {
                  localStorage.removeItem('salesWindowDays')
                }
                localStorage.setItem('activeDeadMonths', String(activeMonths))
              } catch (e) {
                console.warn('Failed to save settings to localStorage', e)
              }

              // Apply baseline threshold and lead time to products
              const applyVal = typeof baselineThreshold === 'number' ? baselineThreshold : 0
              const lt = typeof defaultLeadTime === 'number' ? defaultLeadTime : undefined
              const updated = products.map(p => ({ ...p, low_stock_threshold: applyVal, lead_time_days: lt }))
              setProducts(updated as Product[])
              notificationManager.resetFirstRunFlag()
              notificationManager.checkStockLevels(updated.map(p => ({
                id: getSku(p),
                name: p.name,
                currentStock: getStockLevel(p),
                threshold: p.low_stock_threshold ?? applyVal,
                category: p.category?.name || 'Unknown'
              })))

              setShowSettings(false)
              // Refetch using the newly saved settings so UI is authoritative
              try {
                await loadData()
              } catch (e) {
                console.warn('Refetch after saving settings failed', e)
              }
              // Refresh global PO SKUs when PO window changes
              // try {
              //   await ensurePoSkusLoaded()
              // } catch (e) {
              //   console.warn('Failed to refresh PO SKUs after saving settings', e)
              // }
            }}>Save Settings</Button>
          </div>
        </Card>
      )}

      {/* Business Intelligence Summary Cards (backend-driven) */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-red-500" onClick={() => handleSetStockFilter('out')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{countsLoading ? '—' : outOfStockCountDb.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Items with zero stock</p>
          </CardContent>
        </Card>

  <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500" onClick={() => handleSetStockFilter('active')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <Package className="h-4 w-4 text-green-600" />
              </div>
              <CardTitle className="text-sm font-medium">Active Stock</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{countsLoading ? '—' : activeStockCountDb.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Active SKUs (recent sales)</p>
          </CardContent>
        </Card>

  <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-gray-500" onClick={() => handleSetStockFilter('dead')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Package className="h-4 w-4 text-gray-600" />
              </div>
              <CardTitle className="text-sm font-medium">Dead Stock</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{countsLoading ? '—' : deadStockCountDb.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">No sales in last {deadMonths} month{deadMonths !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

  <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-500" onClick={() => handleSetStockFilter('needed')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Package className="h-4 w-4 text-amber-600" />
              </div>
              <CardTitle className="text-sm font-medium">Reorder Needed</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{countsLoading ? '—' : needsReorderCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Items below reorder point (uses lead time)</p>
          </CardContent>
        </Card>
      </div>

      {/* Products Table with Integrated Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Product Inventory</CardTitle>
              <CardDescription>Detailed view of all clothing SKUs</CardDescription>
            </div>
            <SimpleUploadButton onUploadComplete={loadData} />
          </div>
          
          {/* Integrated Search and Filters */}
          <div className="space-y-4 mt-4">
            {/* Search and Filters */}
            <div className="grid gap-2 md:grid-cols-5">
              {/* Search */}
              <div className="relative md:col-span-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, SKU, brand, color, supplier..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setTypeahead(e.target.value)
                  }}
                  className="pl-8"
                />

                {/* Typeahead dropdown */}
                {typeahead && (
                  <div className="absolute left-0 right-0 top-12 bg-popover shadow rounded-md z-50">
                    {suggestions.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">No suggestions</div>
                    ) : (
                      suggestions.slice(0, 10).map(s => (
                        <div
                          key={getSku(s)}
                          className="p-2 hover:bg-muted/50 cursor-pointer"
                          onClick={() => {
                            setSearchTerm(s.name)
                            setTypeahead("")
                            setSuggestions([])
                          }}
                        >
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.sku} • {s.size} • {s.brand}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Category Filter */}
              <div className="md:col-span-1">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  {/* make trigger full width so it fits the grid cell */}
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all"><span className="block truncate max-w-[20rem]">All Categories</span></SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        <span className="block truncate max-w-[20rem]">{c.name}</span>
                      </SelectItem>
                    ))}
                    {/* If selectedCategory is not in the list (possible when switching sources), show it so user can clear it */}
                    {selectedCategory !== 'all' && !categories.find(c => c.id.toString() === selectedCategory) && (
                      <SelectItem key={`selected-cat-${selectedCategory}`} value={selectedCategory}><span className="block truncate max-w-[20rem]">{selectedCategory}</span></SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Color filter removed — products do not include color field */}
              {/* Size Filter */}
              <div className="md:col-span-1">
                <Select value={selectedSize} onValueChange={setSelectedSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sizes</SelectItem>
                    {uniqueSizes.map(size => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                    {/* If the currently selected size isn't in the list (possible when switching sources), show it so user can clear it */}
                    {selectedSize !== 'all' && !uniqueSizes.includes(selectedSize) && (
                      <SelectItem key={`selected-${selectedSize}`} value={selectedSize}>{selectedSize}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Color filter removed */}

              {/* Stock Status Filter with Sort */}
              <div className="flex items-center gap-1">
                <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1">
              <Select value={stockFilter.join(',')} onValueChange={(v) => handleSetStockFilter(v)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Stock Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stock Levels</SelectItem>
                      <SelectItem value="out">🔴 Out of Stock</SelectItem>
                      <SelectItem value="low">🟡 Low Stock</SelectItem>
                      <SelectItem value="needed">🟠 Reorder Needed</SelectItem>
                      {/* <SelectItem value="po">🔵 Incoming PO</SelectItem> */}
                      <SelectItem value="normal">🟢 Normal Stock</SelectItem>
                      <SelectItem value="active">🟢 Active Stock</SelectItem>
                      <SelectItem value="dead">⚪ Dead Stock</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={stockSort} onValueChange={setStockSort}>
                    <SelectTrigger className="w-16">
                      <ArrowUpDown className="h-4 w-4" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Sort</SelectItem>
                      <SelectItem value="asc">↑ Low to High</SelectItem>
                      <SelectItem value="desc">↓ High to Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </div>

            {/* Clear All Filters Button */}
            <div className="mt-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setSearchTerm("")
                  setSelectedCategory("all")
                  setSelectedSize("all")
                  setStockFilter(['all'])
                  setStockSort("none")
                }}
              >
                Clear All Filters
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {filteredProducts.length.toLocaleString()} of {totalProducts.toLocaleString()} SKUs
              </p>
              
              {/* Contextual Filter Info */}
              {( !(stockFilter.length === 1 && stockFilter[0] === 'all') || stockSort !== "none" || selectedCategory !== "all" || selectedSize !== "all" || searchTerm) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Active filters:</span>
                  {stockFilter.map(f => f !== 'all' && (
                    <Badge key={`filter-${f}`} variant="outline" className="text-xs flex items-center gap-2">
                      <span>
                        {f === "out" ? "🔴 Out of Stock" :
                         f === "low" ? "🟡 Low Stock" :
                         f === "needed" ? "🟠 Reorder Needed" :
                         f === "po" ? "🔵 Incoming PO" :
                         f === "normal" ? "🟢 Normal Stock" :
                         f === "active" ? "🟢 Active Stock" :
                         f === "dead" ? "⚪ Dead Stock" : f}
                      </span>
                      <button
                        aria-label={`Remove ${f} filter`}
                        className="text-muted-foreground hover:text-destructive leading-none"
                        onClick={() => removeFilter(f, 'stock')}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                  {stockSort !== "none" && (
                    <Badge variant="outline" className="text-xs">
                      {stockSort === "asc" ? "↑ Low to High" : "↓ High to Low"}
                    </Badge>
                  )}
                  {selectedCategory !== "all" && (
                    <Badge variant="outline" className="text-xs flex items-center gap-2">
                      <span>{categories.find(c => c.id.toString() === selectedCategory)?.name || selectedCategory}</span>
                      <button aria-label="Remove category filter" className="text-muted-foreground hover:text-destructive leading-none" onClick={() => removeFilter('', 'category')}>×</button>
                    </Badge>
                  )}
                  {selectedSize !== "all" && (
                    <Badge variant="outline" className="text-xs flex items-center gap-2">
                      <span>Size: {selectedSize}</span>
                      <button aria-label="Remove size filter" className="text-muted-foreground hover:text-destructive leading-none" onClick={() => removeFilter('', 'size')}>×</button>
                    </Badge>
                  )}
                  {/* Color badge removed */}
                  {searchTerm && (
                    <Badge variant="outline" className="text-xs flex items-center gap-2">
                      <span>Search: "{searchTerm}"</span>
                      <button aria-label="Clear search" className="text-muted-foreground hover:text-destructive leading-none" onClick={() => removeFilter('', 'search')}>×</button>
                    </Badge>
                  )}
                </div>
              )}
            </div>
            
            {/* Filter Summary Stats */}
            {filteredProducts.length > 0 && !(stockFilter.length === 1 && stockFilter[0] === 'all') && (
              <div className="text-xs text-muted-foreground">
                {stockFilter.map((f, i) => {
                  if (f === 'all') return null
                  let text = ''
                  if (f === 'out') {
                    const count = outOfStockSkus && outOfStockSkus.size > 0 ? Array.from(filteredProducts).filter(p => outOfStockSkus.has(getSku(p))).length : filteredProducts.filter(p => getStockLevel(p) === 0).length
                    text = `🔴 ${count} out of stock items`
                  } else if (f === 'low') {
                    const count = filteredProducts.filter(p => getStockLevel(p) > 0 && getStockLevel(p) <= (p.low_stock_threshold ?? (typeof baselineThreshold === 'number' ? baselineThreshold : 0))).length
                    text = `🟡 ${count} low stock items`
                  } else if (f === 'needed') {
                    const count = filteredProducts.filter(p => getStockLevel(p) <= (typeof p.reorder_point === 'number' ? p.reorder_point : (p.low_stock_threshold ?? getBaselineThreshold(baselineThreshold)))).length
                    text = `🟠 ${count} items need reorder`
                  } else if (f === 'active') {
                    text = `🟢 ${filteredProducts.length} active items with recent sales`
                  } else if (f === 'dead') {
                    const count = deadSkus && deadSkus.size > 0 ? Array.from(filteredProducts).filter(p => deadSkus.has(getSku(p))).length : filteredProducts.length
                    text = `⚪ ${count} dead stock items`
                  }
                  return <span key={`summary-${f}`}>{i > 0 ? ' • ' : ''}{text}</span>
                })}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-20 gap-2 p-3 bg-muted/50 border-b font-medium text-sm">
              <div className="col-span-3 text-left">SKU</div>
              <div className="col-span-6 text-left">Product Details</div>
              <div className="col-span-2 text-left">Category</div>
              <div className="col-span-2 text-center">Stock Level</div>
              <div className="col-span-2 text-center">Sales Rate</div>
              <div className="col-span-2 text-center">Days Left</div>
              {/* PO column removed from UI */}
              <div className="col-span-3 text-center">Status</div>
            </div>

            {/* Virtualized Product Rows */}
            {currentPageItems.length > 0 ? (
              <div style={{ height: Math.min(800, currentPageItems.length * rowHeight) }}>
                <List
                  height={Math.min(800, currentPageItems.length * rowHeight)}
                  itemCount={currentPageItems.length}
                  itemSize={rowHeight}
                  width={'100%'}
                >
                  {({ index, style }: { index: number; style: React.CSSProperties }) => {
                    const product = currentPageItems[index]
                    return (
                      <div
                        key={getSku(product)}
                        style={style}
                        className="grid grid-cols-20 gap-2 p-3 border-b hover:bg-muted/50 cursor-pointer transition-colors items-center"
                        onClick={() => router.push(`/dashboard/products/${encodeURIComponent(getSku(product))}`)}
                      >
                        {/* SKU */}
                        <div className="col-span-3 font-mono text-sm text-muted-foreground">
                          {product.sku}
                        </div>
                        
                        {/* Product Details */}
                        <div className="col-span-6">
                          <div
                            className="font-medium text-sm"
                            title={product.name}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'normal'
                            }}
                          >
                            {product.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {product.size && <Badge variant="outline" className="text-xs px-1 py-0">{product.size}</Badge>}
                          </div>
                        </div>
                        
                        {/* Category */}
                        <div
                          className="col-span-2 text-sm truncate"
                          title={product.category?.name || '—'}
                        >
                          {product.category?.name || '—'}
                        </div>
                        
                        {/* Stock Level */}
                        <div className="col-span-2 text-center">
                          <span className={`font-medium text-sm ${
                            getStockLevel(product) === 0 ? 'text-red-600' :
                            getStockLevel(product) <= (product.low_stock_threshold ?? getBaselineThreshold(baselineThreshold)) ? 'text-amber-600' :
                            'text-green-600'
                          }`}>
                            {getStockLevel(product).toLocaleString()}
                          </span>
                        </div>
                        
                        {/* Sales Rate */}
                        <div className="col-span-2 text-center">
                          <div className="flex flex-col items-center">
                            {(() => {
                              // Prefer backend-provided rate attached to product
                              const backendRate = (product as any).daily_sales_rate
                              if (loadingSales) {
                                return <span className="text-xs text-muted-foreground">Loading...</span>
                              }

                              if (typeof backendRate === 'number') {
                                return (
                                  <>
                                    <span className="font-medium text-sm">{backendRate.toFixed(2)}</span>
                                    <span className="text-xs text-muted-foreground">per day</span>
                                  </>
                                )
                              }

                              // Explicitly do NOT show client-side computed averages here. Show placeholder when backend metric missing.
                              return (
                                <>
                                  <span className="font-medium text-sm">—</span>
                                  <span className="text-xs text-muted-foreground">no sales data</span>
                                </>
                              )
                            })()} 
                          </div>
                        </div>
                        
                        {/* Days Until Stockout */}
                        <div className="col-span-2 text-center">
                          {(() => {
                            // If stock is zero, show 0 days left explicitly
                            const stock = getStockLevel(product)
                            if (stock === 0) {
                              return (
                                <span className="font-medium text-sm text-red-600">0d</span>
                              )
                            }

                            // Use backend-provided daily_sales_rate if available
                            const backendRate = (product as any).daily_sales_rate
                            if (loadingSales) {
                              return <span className="text-xs text-muted-foreground">Loading...</span>
                            }

                            let daysLeft: number | null = null
                            if (typeof backendRate === 'number' && backendRate > 0) {
                              daysLeft = Math.floor(stock / backendRate)
                            }

                            if (daysLeft === null) return <span className="font-medium text-sm">—</span>

                            return (
                              <span className={`font-medium text-sm ${
                                daysLeft < 7 ? 'text-red-600' :
                                daysLeft < 14 ? 'text-orange-600' :
                                daysLeft < 30 ? 'text-amber-600' : 'text-green-600'
                              }`}>
                                {`${daysLeft}d`}
                              </span>
                            )
                          })()} 
                        </div>
                        
                        {/* PO indicator removed from UI */}
                        
                        {/* Status Badge (normalize to Out / Low / Normal; avoid showing 'Dead' in table) */}
                        <div className="col-span-3 text-center">
                          {(() => {
                            // Out
                            if (getStockLevel(product) === 0) {
                              return <Badge variant="destructive" className="text-xs px-2 py-1 bg-red-600 text-white">Out</Badge>
                            }

                            // Urgent reorder
                            if (product.days_until_stockout! < 7) {
                              return <Badge variant="destructive" className="text-xs px-2 py-1 bg-red-500 text-white">Urgent</Badge>
                            }

                            // Low stock
                            if (getStockLevel(product) <= (product.low_stock_threshold ?? getBaselineThreshold(baselineThreshold))) {
                              return <Badge variant="secondary" className="text-xs px-2 py-1 bg-amber-500 text-white">Low</Badge>
                            }

                            // If no recent sales activity, do not show 'Dead' in the table — show 'Normal' so filters remain meaningful
                            // Keep a 'Watch' badge for stock that will run out within 30 days but is not yet low
                            if (product.days_until_stockout! < 30) {
                              return <Badge variant="outline" className="text-xs px-2 py-1 bg-yellow-500 text-black">Watch</Badge>
                            }

                            // Default to Normal
                            return <Badge variant="default" className="text-xs px-2 py-1 bg-green-500 text-white">Normal</Badge>
                          })()}
                        </div>
                      </div>
                    )
                  }}
                </List>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No products found matching your criteria.</p>
                <p className="text-sm mt-1">Try adjusting your filters or search terms.</p>
              </div>
            )}

            {/* Pagination controls */}
            {filteredProducts.length > 0 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {filteredProducts.length.toLocaleString()} results — page {page} of {pageCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">Items per page:</label>
                    <Select value={pageSize.toString()} onValueChange={(value) => {
                      setPageSize(Number(value))
                      setPage(1) // Reset to first page when changing page size
                    }}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPage(1)} disabled={page === 1}>
                    First
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                    Prev
                  </Button>
                  {(() => {
                    if (pageCount <= 1) return null
                    
                    const visiblePages = []
                    const maxVisible = 5
                    let startPage = Math.max(1, page - Math.floor(maxVisible / 2))
                    let endPage = Math.min(pageCount, startPage + maxVisible - 1)
                    
                    // Adjust startPage if we're near the end
                    if (endPage - startPage + 1 < maxVisible) {
                      startPage = Math.max(1, endPage - maxVisible + 1)
                    }
                    
                    for (let p = startPage; p <= endPage; p++) {
                      visiblePages.push(p)
                    }
                    
                    return visiblePages.map((p) => (
                      <Button 
                        key={`page-${p}`} 
                        size="sm" 
                        variant={p === page ? 'default' : 'outline'} 
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    ))
                  })()}
                  <Button size="sm" variant="outline" onClick={() => setPage(Math.min(pageCount, page + 1))} disabled={page === pageCount}>
                    Next
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPage(pageCount)} disabled={page === pageCount}>
                    Last
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
