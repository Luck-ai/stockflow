"use client"

import React, { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3 } from "lucide-react"
import { useRouter } from "next/navigation"

interface Product {
  id?: string | number
  sku?: string
  name?: string
  quantity?: number
  stock_level?: number
}

interface TopPerformersTabProps {
  topSkus: any[] | null
  products: Product[]
  allSales: any[]
  channelHex: Record<string, string>
  getCanonicalChannelName: (channel: string | undefined | null) => string
  topSkusLimit: number
  onTopSkusLimitChange: (limit: number) => void
}

const getSku = (product: Product): string => {
  return product.sku ?? String(product.id ?? '')
}

export const TopPerformersTab = React.memo(({ 
  topSkus,
  products,
  allSales,
  channelHex,
  getCanonicalChannelName,
  topSkusLimit,
  onTopSkusLimitChange
}: TopPerformersTabProps) => {
  const router = useRouter()

  const handleProductClick = (sku: string) => {
    router.push(`/dashboard/products/${encodeURIComponent(sku)}`)
  }

  // Calculate channel performance for each SKU
  const skuChannelData = useMemo(() => {
    const dataMap = new Map<string, { channels: Record<string, number>, total: number, topChannel: string }>()
    
    if (!allSales || allSales.length === 0) return dataMap
    
    for (const sale of allSales) {
      const sku = sale.sku || sale.raw_id || ''
      if (!sku) continue
      
      const channel = getCanonicalChannelName(sale.platform || sale.channel || sale.source || sale.store)
      const qty = Number(sale.quantity || sale.qty || sale.units || sale.quantity_sold || 0)
      
      if (!dataMap.has(sku)) {
        dataMap.set(sku, { channels: {}, total: 0, topChannel: '' })
      }
      
      const skuData = dataMap.get(sku)!
      skuData.channels[channel] = (skuData.channels[channel] || 0) + qty
      skuData.total += qty
    }
    
    // Determine top channel for each SKU
    for (const [sku, data] of dataMap.entries()) {
      let maxQty = 0
      let topCh = 'unknown'
      for (const [ch, qty] of Object.entries(data.channels)) {
        if (qty > maxQty) {
          maxQty = qty
          topCh = ch
        }
      }
      data.topChannel = topCh
    }
    
    return dataMap
  }, [allSales, getCanonicalChannelName])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Top Performing Products
            </CardTitle>
            <CardDescription>
              Products with highest sales velocity and multi-channel performance
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Show top</label>
            <select 
              value={topSkusLimit} 
              onChange={(e) => onTopSkusLimitChange(Number(e.target.value))}
              className="px-3 py-1 rounded border bg-card text-card-foreground text-sm"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="text-sm text-muted-foreground">SKUs</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topSkus === null && (
            <div className="p-4 text-sm text-muted-foreground">Loading top SKUs...</div>
          )}
          {topSkus && topSkus.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No top SKU data available from backend.</div>
          )}
          {topSkus && topSkus.length > 0 && (
            topSkus.map((skuRec: any, index: number) => {
              const sku = skuRec.sku || skuRec.raw_id || ''
              const prod = products.find(p => (p.sku || String(p.id)) === sku)
              const name = prod?.name ?? sku
              const currentStock = prod?.quantity ?? prod?.stock_level ?? 0
              const totalSold = skuRec.total_quantity ?? 0
              const channelData = skuChannelData.get(sku)
              
              return (
                <div 
                  key={sku || index} 
                  className="border rounded-lg transition-all duration-200 hover:shadow-md hover:border-primary/50 bg-card cursor-pointer"
                  onClick={() => handleProductClick(sku)}
                >
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4 flex-1">
                      <Badge 
                        variant="outline" 
                        className="w-10 h-10 flex items-center justify-center font-semibold text-base shrink-0"
                      >
                        {index + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base hover:text-primary transition-colors truncate">
                          {name}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{sku}</span>
                          {channelData && (
                            <>
                              <span className="hidden sm:inline">•</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs">Top:</span>
                                <Badge 
                                  variant="secondary" 
                                  className="text-xs px-2 py-0.5"
                                  style={{ 
                                    backgroundColor: `${channelHex[channelData.topChannel] || '#9ca3af'}15`, 
                                    color: channelHex[channelData.topChannel] || '#9ca3af',
                                    borderColor: channelHex[channelData.topChannel] || '#9ca3af'
                                  }}
                                >
                                  {channelData.topChannel}
                                </Badge>
                              </div>
                              <span className="hidden sm:inline">•</span>
                              <span className="text-xs hidden sm:inline">{Object.keys(channelData.channels).length} channel{Object.keys(channelData.channels).length !== 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-base">{currentStock.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">in stock</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-base text-primary">{totalSold.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">sold</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
})

TopPerformersTab.displayName = 'TopPerformersTab'
