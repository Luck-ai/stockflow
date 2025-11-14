export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002'

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) }
  const body = (options as any).body
  if (!headers['Content-Type'] && body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  
  console.log(`API Request: ${options.method || 'GET'} ${API_BASE}${path}`)
  if (body instanceof FormData) {
    console.log('FormData upload detected')
  }
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  console.log(`API Response: ${res.status} ${res.statusText}`)
  return res
}

// Types used by the frontend
export interface Product {
  id: number
  name: string
  sku: string
  category_id: number | null
  description: string | null
  price: number
  // legacy mock field
  quantity: number
  // backend authoritative stock field
  stock_level?: number
  low_stock_threshold: number
  size: string
  // color as stored in the backend product table
  color?: string
  material?: string
  brand?: string
  user_id: number | null
  last_updated: string | null
  category: ProductCategory | null
  // Optional backend-provided sales metrics
  daily_sales_rate?: number
  last_sale_date?: string | null
}

export interface ProductCategory {
  id: number
  name: string
  description: string | null
  user_id: number | null
}

export interface Sale {
  sale_id: number
  channel: string
  date: string
  sku: string
  quantity: number
  created_at?: string
}

export interface SalesAnalysis {
  totalSales: number
  lastSaleDate: string | null
  daysSinceLastSale: number
  averageDailySales: number
  isActive: boolean
}

export interface FileUploadData {
  sales_file?: File
  stock_file?: File
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type DataSourceKey = 'pajara'

export function setDataSource(_: DataSourceKey) {
  // No-op: mock data sources have been removed. The app should use the backend (pajara).
}

export function getDataSource(): DataSourceKey {
  return 'pajara'
}

export function debugDataSource() {
  console.log('Data source fixed to pajara; mock data removed')
  console.log('API_BASE:', API_BASE)
  return { currentDataSource: 'pajara', API_BASE, availableSources: ['pajara'] }
}

// Mock helpers for restock/out-of-stock views (client-side only)
// Stock record returned by new backend endpoints
export interface StockRecordBackend {
  raw_id: string
  name: string
  category?: string | null
  quantity: number
  last_sale_date?: string | null
}

// Call backend /stock/out_of_stock
export async function getOutOfStockProducts(): Promise<Product[]> {
  const res = await apiFetch('/stock/out_of_stock')
  if (!res.ok) throw new Error('Failed to fetch out-of-stock items')
  const json = await res.json()
  if (!json || !Array.isArray(json.items)) return []
  return json.items.map((it: any) => ({ ...it, sku: it.raw_id, stock_level: it.quantity }))
}

// Call backend /stock/low?threshold=
export async function getLowStockProducts(threshold: number): Promise<Product[]> {
  const res = await apiFetch(`/stock/low?threshold=${encodeURIComponent(String(threshold))}`)
  if (!res.ok) throw new Error('Failed to fetch low-stock items')
  const json = await res.json()
  if (!json || !Array.isArray(json.items)) return []
  return json.items.map((it: any) => ({ ...it, sku: it.raw_id, stock_level: it.quantity }))
}

// Call backend /stock/dead?months=
export async function getDeadStock(months = 6): Promise<StockRecordBackend[]> {
  const res = await apiFetch(`/stock/activity?status=dead&months=${encodeURIComponent(String(months))}`)
  if (!res.ok) throw new Error('Failed to fetch dead stock items')
  const json = await res.json()
  if (!json || !Array.isArray(json.items)) return []
  return json.items.map((it: any) => ({
    raw_id: it.raw_id,
    name: it.name,
    category: it.category,
    quantity: it.quantity,
    last_sale_date: it.last_sale_date || null,
  }))
}

// Call backend /stock/active
export async function getActiveStock(months = 6): Promise<StockRecordBackend[]> {
  const res = await apiFetch(`/stock/activity?status=active&months=${encodeURIComponent(String(months))}`)
  if (!res.ok) throw new Error('Failed to fetch active stock items')
  const json = await res.json()
  if (!json || !Array.isArray(json.items)) return []
  return json.items.map((it: any) => ({
    raw_id: it.raw_id,
    name: it.name,
    category: it.category,
    quantity: it.quantity,
    last_sale_date: it.last_sale_date || null,
  }))
}

// Helper: check whether a particular SKU is considered active by backend
export async function isSkuActiveOnBackend(sku: string, months = 6): Promise<boolean> {
  try {
    const res = await apiFetch(`/stock/activity?sku=${encodeURIComponent(String(sku))}&months=${encodeURIComponent(String(months))}`)
    if (!res.ok) {
      console.error('Failed checking SKU activity:', res.statusText)
      return false
    }
    const json = await res.json()
    // Expect { raw_id, is_active, last_sale_date }
    return !!(json && (json.is_active === true))
  } catch (e) {
    console.error('Failed to check active SKU on backend', e)
    return false
  }
}

// Products/Categories - call backend only when using 'pajara'
export async function getProducts(
  filters?: { category?: string | null; size?: string | null; color?: string | null },
  salesWindowDays?: number
): Promise<Product[]> {
  console.log('[getProducts] Called with salesWindowDays:', salesWindowDays, 'type:', typeof salesWindowDays)
  const params = new URLSearchParams()
  if (filters) {
    if (filters.category != null) params.set('category', String(filters.category))
    if (filters.size) params.set('size', filters.size)
  }
  if (typeof salesWindowDays === 'number') params.set('sales_window_days', String(salesWindowDays))
  const path = params.toString() ? `/products?${params.toString()}` : '/products'
  console.log('[getProducts] Final path:', path)
  const res = await apiFetch(path)
  if (!res.ok) throw new Error('Failed to fetch products')
  const json = await res.json()
  // Backend returns { total, items } — return items for compatibility
  if (json && Array.isArray(json.items)) {
    // Backend product records use `raw_id` for the SKU identifier; map to `sku` for frontend compatibility
    return json.items.map((it: any) => ({
      ...it,
      sku: it.raw_id,
      daily_sales_rate: it.daily_sales_rate ?? undefined,
    }))
  }
  if (Array.isArray(json)) return json
  return []
}

// Fetch available sizes and colors from the backend (pajara). This will fetch
// products and derive distinct values. We intentionally keep this in the
// frontend so the client can populate filter dropdowns without requiring
// new backend endpoints.
export async function getAvailableSizesAndColors(): Promise<{ sizes: string[]; colors: string[] }> {
  const res = await apiFetch('/products/facets')
  if (!res.ok) throw new Error('Failed to fetch product facets')
  const json = await res.json()
  return { sizes: json.sizes || [], colors: [] }
}

export async function getCategories(): Promise<ProductCategory[]> {
  const res = await apiFetch('/categories')
  if (!res.ok) throw new Error('Failed to fetch categories')
  const json = await res.json()
  if (json && Array.isArray(json.items)) return json.items
  if (Array.isArray(json)) return json
  return []
}

// Sales API functions
export async function getAllSales(): Promise<Sale[]> {
  const res = await apiFetch('/sales')
  if (!res.ok) throw new Error('Failed to fetch sales data')
  const json = await res.json()
  if (json && Array.isArray(json.items)) return json.items.map((s: any) => ({ ...s, sku: s.item_id }))
  if (Array.isArray(json)) return json
  return []
}

let __salesCache: { ts: number; data: Sale[] } | null = null

const SALES_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function getAllSalesCached(ttlMs = SALES_CACHE_TTL_MS): Promise<Sale[]> {
  const now = Date.now()
  if (__salesCache && (now - __salesCache.ts) < ttlMs) {
    return __salesCache.data
  }
  const data = await getAllSales()
  __salesCache = { ts: now, data }
  return data
}

export function clearSalesCache() {
  __salesCache = null
}

// Generic in-memory cache for other read-only API functions
const __apiCache = new Map<string, { ts: number; data: any }>()
// Default cache TTL for read-only endpoints (categories, top skus, facets, BI counts)
const DEFAULT_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

async function getCached<T>(key: string, loader: () => Promise<T>, ttlMs = DEFAULT_CACHE_TTL): Promise<T> {
  const now = Date.now()
  const hit = __apiCache.get(key)
  if (hit && (now - hit.ts) < ttlMs) return hit.data as T
  const data = await loader()
  __apiCache.set(key, { ts: now, data })
  return data
}

export function clearApiCache(key?: string) {
  if (typeof key === 'string') __apiCache.delete(key)
  else __apiCache.clear()
}

// Cached wrappers for commonly reused read-only endpoints
export async function getProductsCached(
  filters?: { category?: string | null; size?: string | null; color?: string | null },
  salesWindowDays?: number,
  ttlMs = DEFAULT_CACHE_TTL
): Promise<Product[]> {
  const key = `products:${JSON.stringify(filters || {})}:sw:${String(salesWindowDays || '')}`
  return getCached(key, () => getProducts(filters, salesWindowDays), ttlMs)
}

export async function getCategoriesCached(ttlMs = DEFAULT_CACHE_TTL): Promise<ProductCategory[]> {
  return getCached('categories', () => getCategories(), ttlMs)
}

export async function getAvailableSizesAndColorsCached(ttlMs = DEFAULT_CACHE_TTL): Promise<{ sizes: string[]; colors: string[] }> {
  return getCached('product_facets', () => getAvailableSizesAndColors(), ttlMs)
}

export async function getTopSkusCached(limit = 5, ttlMs = DEFAULT_CACHE_TTL) {
  const key = `top_skus:${limit}`
  return getCached(key, () => getTopSkus(limit), ttlMs)
}

export async function getTopCategoriesCached(limit = 10, ttlMs = DEFAULT_CACHE_TTL) {
  const key = `top_categories:${limit}`
  return getCached(key, () => getTopCategories(limit), ttlMs)
}

export async function getOutOfStockProductsCached(ttlMs = DEFAULT_CACHE_TTL) {
  return getCached('out_of_stock', () => getOutOfStockProducts(), ttlMs)
}

export async function getLowStockProductsCached(threshold: number, ttlMs = DEFAULT_CACHE_TTL) {
  const key = `low_stock:${threshold}`
  return getCached(key, () => getLowStockProducts(threshold), ttlMs)
}

export async function getDeadStockCached(months = 6, ttlMs = DEFAULT_CACHE_TTL) {
  const key = `dead_stock:${months}`
  return getCached(key, () => getDeadStock(months), ttlMs)
}

export async function getActiveStockCached(months = 6, ttlMs = DEFAULT_CACHE_TTL) {
  const key = `active_stock:${months}`
  return getCached(key, () => getActiveStock(months), ttlMs)
}

export async function getSalesBySku(sku: string): Promise<Sale[]> {
  const res = await apiFetch(`/sales/${encodeURIComponent(sku)}`)
  if (!res.ok) {
    // Don't throw here — return an empty array so the UI can show the "no sales data" state.
    // Log a warning for developers to diagnose backend/API issues.
    // Keep the API consistent by returning an empty array of Sale.
    // eslint-disable-next-line no-console
    console.warn(`getSalesBySku: non-ok response for SKU=${sku} status=${res.status}`)
    return []
  }
  const json = await res.json()
  if (json && Array.isArray(json.items)) return json.items.map((s: any) => ({ ...s, sku: s.item_id }))
  if (Array.isArray(json)) return json
  return []
}

export interface MarketShareResponse {
  sku: string
  product_total: number
  category: string | null
  category_total: number
  overall_total: number
  product_share_of_category: number
  product_share_of_overall: number
}

export async function getMarketShareForSku(sku: string): Promise<MarketShareResponse | null> {
  try {
    const res = await apiFetch(`/analytics/sales/market-share?sku=${encodeURIComponent(String(sku))}`)
    if (!res.ok) {
      console.warn('getMarketShareForSku: non-ok response', res.status)
      return null
    }
    const json = await res.json()
    return json as MarketShareResponse
  } catch (e) {
    console.error('Failed to fetch market share for sku', sku, e)
    return null
  }
}

/*
export interface POItem {
  quantity: number
  transaction_date: string
  item_id: string
  name?: string | null
}

export async function getPOs(limit?: number, days?: number, start_date?: string): Promise<POItem[]> {
  const params = new URLSearchParams()
  if (typeof limit === 'number') params.set('limit', String(limit))
  if (typeof days === 'number') params.set('days', String(days))
  if (typeof start_date === 'string' && start_date) params.set('start_date', start_date)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await apiFetch(`/upload/po${qs}`)
  if (!res.ok) {
    console.warn('Failed to fetch PO list')
    return []
  }
  const json = await res.json()
  if (json && Array.isArray(json.items)) return json.items
  return []
}

export async function getPOsBySku(sku: string, limit?: number, days?: number, start_date?: string): Promise<POItem[]> {
  const params = new URLSearchParams()
  if (typeof limit === 'number') params.set('limit', String(limit))
  if (typeof days === 'number') params.set('days', String(days))
  if (typeof start_date === 'string' && start_date) params.set('start_date', start_date)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await apiFetch(`/upload/po/${encodeURIComponent(sku)}${qs}`)
  if (!res.ok) {
    console.warn('Failed to fetch PO rows for SKU', sku)
    return []
  }
  const json = await res.json()
  if (json && Array.isArray(json.items)) return json.items
  return []
}
*/

// Top SKUs / Categories helpers
export interface TopSkuRecord {
  sku: string
  total_quantity: number
}

export interface TopCategoryRecord {
  category: string | null
  total_quantity: number
  product_count?: number
}

export async function getTopSkus(limit = 5): Promise<TopSkuRecord[]> {
  const res = await apiFetch(`/sales/top_skus?limit=${encodeURIComponent(String(limit))}`)
  if (!res.ok) throw new Error('Failed to fetch top SKUs')
  const json = await res.json()
  if (json && Array.isArray(json.items)) return json.items.map((it: any) => ({ sku: it.sku || it.item_id || '', total_quantity: Number(it.total_quantity || 0) }))
  if (Array.isArray(json)) return json.map((it: any) => ({ sku: it.sku || it.item_id || '', total_quantity: Number(it.total_quantity || 0) }))
  return []
}

export async function getTopCategories(limit = 10): Promise<TopCategoryRecord[]> {
  const res = await apiFetch(`/sales/top_categories?limit=${encodeURIComponent(String(limit))}`)
  if (!res.ok) throw new Error('Failed to fetch top categories')
  const json = await res.json()
  if (json && Array.isArray(json.items)) return json.items.map((it: any) => ({ category: it.category ?? null, total_quantity: Number(it.total_quantity || 0), product_count: Number(it.product_count || 0) }))
  if (Array.isArray(json)) return json.map((it: any) => ({ category: it.category ?? null, total_quantity: Number(it.total_quantity || 0), product_count: Number(it.product_count || 0) }))
  return []
}

// Analyze sales data to determine if a product is active
export function analyzeSalesData(sales: Sale[]): SalesAnalysis {
  if (sales.length === 0) {
    return {
      totalSales: 0,
      lastSaleDate: null,
      daysSinceLastSale: Infinity,
      averageDailySales: 0,
      isActive: false
    }
  }

  const totalSales = sales.reduce((sum, sale) => sum + sale.quantity, 0)
  const sortedSales = [...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const lastSaleDate = sortedSales[0].date
  
  const daysSinceLastSale = Math.floor(
    (new Date().getTime() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24)
  )
  
  // Calculate average daily sales over the last 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  
  const recentSales = sales.filter(sale => new Date(sale.date) >= ninetyDaysAgo)
  const averageDailySales = recentSales.length > 0 
    ? recentSales.reduce((sum, sale) => sum + sale.quantity, 0) / 90
    : 0
    
  // Consider active if has sales in last 30 days OR has decent average daily sales
  const isActive = daysSinceLastSale <= 30 || averageDailySales > 0.1
  
  return {
    totalSales,
    lastSaleDate,
    daysSinceLastSale,
    averageDailySales,
    isActive
  }
}
// File upload functions
export async function uploadSalesData(
  file: File
): Promise<{ message: string; rows_inserted: number }> {
  console.log('uploadSalesData called with:', { filename: file.name })
  const fd = new FormData()
  fd.append('file', file)

  const url = '/upload/sales'
  console.log('Sales upload URL:', url)

  const res = await apiFetch(url, { method: 'POST', body: fd })
  if (!res.ok) {
    const errorText = await res.text()
    console.error('Sales upload failed:', errorText)
    throw new Error(errorText || 'Failed to upload sales file')
  }
  const result = await res.json()
  console.log('Sales upload result:', result)
  try {
    clearSalesCache()
    clearApiCache()
  } catch (e) {
    console.warn('Failed to clear caches after sales upload', e)
  }
  return result
}

export async function uploadStockData(
  file: File
): Promise<{ message: string; rows_inserted: number }> {
  console.log('uploadStockData called with:', { filename: file.name })
  const fd = new FormData()
  fd.append('file', file)

  const url = '/upload/stock'
  console.log('Stock upload URL:', url)

  const res = await apiFetch(url, { method: 'POST', body: fd })
  if (!res.ok) {
    const errorText = await res.text()
    console.error('Stock upload failed:', errorText)
    throw new Error(errorText || 'Failed to upload stock file')
  }
  const result = await res.json()
  console.log('Stock upload result:', result)
  try {
    clearApiCache()
  } catch (e) {
    console.warn('Failed to clear caches after stock upload', e)
  }
  return result
}

export async function uploadPOData(
  file: File
): Promise<{ message: string; rows_inserted: number }> {
  console.log('uploadPOData called with:', { filename: file.name })
  const fd = new FormData()
  fd.append('file', file)

  const url = '/upload/po'
  console.log('PO upload URL:', url)

  const res = await apiFetch(url, { method: 'POST', body: fd })
  if (!res.ok) {
    const errorText = await res.text()
    console.error('PO upload failed:', errorText)
    throw new Error(errorText || 'Failed to upload PO file')
  }
  const result = await res.json()
  console.log('PO upload result:', result)
  try {
    clearApiCache()
  } catch (e) {
    console.warn('Failed to clear caches after PO upload', e)
  }
  return result
}

export async function uploadSkusData(
  file: File
): Promise<{ message: string; rows_inserted: number }> {
  console.log('uploadSkusData called with:', { filename: file.name })
  const fd = new FormData()
  fd.append('file', file)

  const url = '/upload/skus'
  console.log('SKUs upload URL:', url)

  const res = await apiFetch(url, { method: 'POST', body: fd })
  if (!res.ok) {
    const errorText = await res.text()
    console.error('SKUs upload failed:', errorText)
    throw new Error(errorText || 'Failed to upload SKUs file')
  }
  const result = await res.json()
  console.log('SKUs upload result:', result)
  try {
    clearApiCache()
  } catch (e) {
    console.warn('Failed to clear caches after SKUs upload', e)
  }
  return result
}

/* NOTE: PO upload function above is left as-is but could be deprecated.
   To temporarily disable PO uploads across the frontend, comment out callers
   and UI that reference PO endpoints. The getPOs/getPOsBySku types and
   helpers have been commented above to avoid accidental usage.
*/

// Analytics API endpoints - optimized backend aggregations

export interface TimeSeriesDataPoint {
  period: string
  total: number
}

export interface ChannelDataPoint {
  period: string
  total: number
  [channel: string]: string | number
}

export interface CategoryDataPoint {
  period: string
  total: number
  [category: string]: string | number
}

export async function getSalesTimeSeries(granularity: 'monthly' | 'weekly' = 'monthly'): Promise<TimeSeriesDataPoint[]> {
  const res = await apiFetch(`/analytics/sales/timeseries?granularity=${granularity}`)
  if (!res.ok) {
    console.warn('Failed to fetch sales time series')
    return []
  }
  const json = await res.json()
  return json.data || []
}

export async function getSalesByChannel(
  granularity: 'monthly' | 'weekly' = 'monthly',
  channel?: string
): Promise<{ channels: string[], data: ChannelDataPoint[] }> {
  const params = new URLSearchParams({ granularity })
  if (channel) params.set('channel', channel)
  
  const res = await apiFetch(`/analytics/sales/by-channel?${params.toString()}`)
  if (!res.ok) {
    console.warn('Failed to fetch sales by channel')
    return { channels: [], data: [] }
  }
  const json = await res.json()
  return { channels: json.channels || [], data: json.data || [] }
}

// SKU-scoped sales-by-channel aggregation. Backend should support query
// `/analytics/sales/by-channel?sku=...&granularity=...` and return the same
// shape as getSalesByChannel (channels + data points). This lets the
// frontend avoid grouping large sales arrays for per-SKU channel views.
export async function getSalesByChannelForSku(
  sku: string,
  granularity: 'monthly' | 'weekly' = 'monthly'
): Promise<{ channels: string[], data: ChannelDataPoint[] }> {
  try {
    const params = new URLSearchParams({ granularity })
    if (sku) params.set('sku', String(sku))
    const res = await apiFetch(`/analytics/sales/by-channel?${params.toString()}`)
    if (!res.ok) {
      console.warn('Failed to fetch sales by channel for SKU', sku, res.status)
      return { channels: [], data: [] }
    }
    const json = await res.json()
    return { channels: json.channels || [], data: json.data || [] }
  } catch (e) {
    console.warn('Error fetching sales by channel for SKU', sku, e)
    return { channels: [], data: [] }
  }
}

// Fetch overall per-channel totals for a single SKU (not a timeseries)
export async function getSalesByChannelSummaryForSku(sku: string): Promise<{ total: number; items: { channel: string; total: number }[] }> {
  try {
    const res = await apiFetch(`/analytics/sales/by-channel/sku?sku=${encodeURIComponent(String(sku))}`)
    if (!res.ok) {
      console.warn('Failed to fetch sales by channel summary for SKU', sku, res.status)
      return { total: 0, items: [] }
    }
    const json = await res.json()
    return { total: Number(json.total || 0), items: Array.isArray(json.items) ? json.items : [] }
  } catch (e) {
    console.warn('Error fetching sales by channel summary for SKU', sku, e)
    return { total: 0, items: [] }
  }
}

export async function getSalesByCategory(
  granularity: 'monthly' | 'weekly' = 'monthly',
  category?: string,
  minSales: number = 1000
): Promise<{ categories: string[], data: CategoryDataPoint[] }> {
  const params = new URLSearchParams({ granularity })
  if (category) params.set('category', category)
  if (typeof minSales === 'number') params.set('min_sales', String(minSales))
  
  const res = await apiFetch(`/analytics/sales/by-category?${params.toString()}`)
  if (!res.ok) {
    console.warn('Failed to fetch sales by category')
    return { categories: [], data: [] }
  }
  const json = await res.json()
  return { categories: json.categories || [], data: json.data || [] }
}

export interface ForecastDataPoint {
  date: string
  predicted_quantity: number
  lower_bound?: number
  upper_bound?: number
}

export interface SKUForecast {
  sku_id: string
  sku_name?: string
  category?: string
  forecast_days: number
  mae: number
  mape: string
  forecast: ForecastDataPoint[]
}

export interface CategoryForecast {
  category: string
  forecast_days: number
  mae: number
  mape: string
  forecast: ForecastDataPoint[]
}

export interface ChannelForecast {
  channel: string
  forecast_days: number
  mae: number
  mape: string
  forecast: ForecastDataPoint[]
}

export async function getSKUForecast(skuId: string, forecastDays: number = 84): Promise<SKUForecast | null> {
  try {
    const res = await apiFetch(`/predictions/sku/${encodeURIComponent(skuId)}?forecast_days=${forecastDays}`)
    if (!res.ok) {
      console.warn('Failed to fetch SKU forecast for', skuId, res.status)
      return null
    }
    return await res.json()
  } catch (e) {
    console.warn('Error fetching SKU forecast for', skuId, e)
    return null
  }
}

export async function getCategoryForecast(category: string, forecastDays: number = 84): Promise<CategoryForecast | null> {
  try {
    const res = await apiFetch(`/predictions/category/${encodeURIComponent(category)}?forecast_days=${forecastDays}`)
    if (!res.ok) {
      console.warn('Failed to fetch category forecast for', category, res.status)
      return null
    }
    return await res.json()
  } catch (e) {
    console.warn('Error fetching category forecast for', category, e)
    return null
  }
}

export async function getBulkSKUForecasts(forecastDays: number = 84, limit?: number): Promise<{ total_skus: number, forecasts: SKUForecast[] }> {
  try {
    const params = new URLSearchParams({ forecast_days: String(forecastDays) })
    if (limit) params.set('limit', String(limit))
    
    const res = await apiFetch(`/predictions/skus/bulk?${params.toString()}`)
    if (!res.ok) {
      console.warn('Failed to fetch bulk SKU forecasts', res.status)
      return { total_skus: 0, forecasts: [] }
    }
    return await res.json()
  } catch (e) {
    console.warn('Error fetching bulk SKU forecasts', e)
    return { total_skus: 0, forecasts: [] }
  }
}

export async function getBulkCategoryForecasts(forecastDays: number = 84, limit?: number): Promise<{ total_categories: number, forecasts: CategoryForecast[] }> {
  try {
    const params = new URLSearchParams({ forecast_days: String(forecastDays) })
    if (limit) params.set('limit', String(limit))
    
    const res = await apiFetch(`/predictions/categories/bulk?${params.toString()}`)
    if (!res.ok) {
      console.warn('Failed to fetch bulk category forecasts', res.status)
      return { total_categories: 0, forecasts: [] }
    }
    return await res.json()
  } catch (e) {
    console.warn('Error fetching bulk category forecasts', e)
    return { total_categories: 0, forecasts: [] }
  }
}

export async function getBulkSKUForecastsCached(forecastDays: number = 84, limit?: number, ttlMs = Infinity): Promise<{ total_skus: number, forecasts: SKUForecast[] }> {
  const key = `predictions:skus:weeks:${forecastDays}:limit:${limit || 'all'}`
  return getCached(key, () => getBulkSKUForecasts(forecastDays, limit), ttlMs)
}

export async function getBulkCategoryForecastsCached(forecastDays: number = 84, limit?: number, ttlMs = Infinity): Promise<{ total_categories: number, forecasts: CategoryForecast[] }> {
  const key = `predictions:categories:weeks:${forecastDays}:limit:${limit || 'all'}`
  return getCached(key, () => getBulkCategoryForecasts(forecastDays, limit), ttlMs)
}

export async function getBulkChannelForecasts(forecastDays: number = 84, limit?: number): Promise<{ total_channels: number, forecasts: ChannelForecast[] }> {
  try {
    const params = new URLSearchParams({ forecast_days: String(forecastDays) })
    if (limit) params.set('limit', String(limit))
    
    const res = await apiFetch(`/predictions/channels/bulk?${params.toString()}`)
    if (!res.ok) {
      console.warn('Failed to fetch bulk channel forecasts', res.status)
      return { total_channels: 0, forecasts: [] }
    }
    return await res.json()
  } catch (e) {
    console.warn('Error fetching bulk channel forecasts', e)
    return { total_channels: 0, forecasts: [] }
  }
}

export async function getBulkChannelForecastsCached(forecastDays: number = 84, limit?: number, ttlMs = Infinity): Promise<{ total_channels: number, forecasts: ChannelForecast[] }> {
  const key = `predictions:channels:weeks:${forecastDays}:limit:${limit || 'all'}`
  return getCached(key, () => getBulkChannelForecasts(forecastDays, limit), ttlMs)
}

export function clearPredictionsCache() {
  const keysToDelete: string[] = []
  __apiCache.forEach((_, key) => {
    if (key.startsWith('predictions:')) {
      keysToDelete.push(key)
    }
  })
  keysToDelete.forEach(key => clearApiCache(key))
}

