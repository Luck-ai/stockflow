"use client"

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { BarChart3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface CategoryBreakdownTabProps {
  topCategories: any[] | null
  categoryUnitFilter: number
  onFilterChange: (value: number) => void
  onCategoryClick: (categoryName: string) => void
}

export const CategoryBreakdownTab = React.memo(({ 
  topCategories,
  categoryUnitFilter,
  onFilterChange,
  onCategoryClick
}: CategoryBreakdownTabProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Sales by Category (units)
            </CardTitle>
            <CardDescription>Distribution of sales (units) across product categories</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Min units</label>
            <input
              type="number"
              min={0}
              value={categoryUnitFilter}
              onChange={(e) => onFilterChange(Number(e.target.value || 0))}
              className="w-24 px-2 py-1 border rounded"
            />
            <div className="flex items-center gap-1">
              {[0, 50, 100, 500, 1000].map(v => (
                <button 
                  key={v} 
                  onClick={() => onFilterChange(v)} 
                  className={`px-2 py-1 text-sm rounded ${categoryUnitFilter === v ? 'bg-blue-600 text-white' : 'bg-muted/50'}`}
                >
                  {v === 0 ? 'All' : v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {topCategories === null && (
            <div className="p-4 text-sm text-muted-foreground">Loading category sales...</div>
          )}
          {topCategories && topCategories.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No category sales data available from backend.</div>
          )}
          {topCategories && topCategories.length > 0 && (() => {
            // Derive a source array with name, units and productCount (with safe fallbacks)
            const source = topCategories.map((c: any) => {
              const name = c.category || 'Unknown'
              const units = Number(c.total_quantity || c.units || 0)
              // Prefer backend-provided product_count when present; fall back to legacy fields
              const productCount = Number(c.product_count ?? c.productCount ?? c.count ?? c.num_products ?? c.products ?? 0)
              return { name, units, productCount }
            })
            const filtered = source.filter(d => d.units >= (categoryUnitFilter || 0))
            const totalCategories = topCategories.length

            // Custom tooltip to display both units and number of products
            const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null
              const entry = payload[0].payload || {}
              const units = typeof entry.units === 'number' ? entry.units : Number(entry.units || 0)
              const productCount = typeof entry.productCount === 'number' ? entry.productCount : (entry.productCount ? Number(entry.productCount) : 0)
              return (
                <div className="bg-white p-2 border rounded shadow-sm">
                  <div className="font-medium">{label}</div>
                  <div className="text-sm text-muted-foreground">Units: <span className="font-semibold">{units.toLocaleString()}</span></div>
                  <div className="text-sm text-muted-foreground">Products: <span className="font-semibold">{(productCount > 0) ? productCount.toLocaleString() : '—'}</span></div>
                </div>
              )
            }
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">Total categories: <span className="font-medium text-foreground">{totalCategories}</span></div>
                  <div className="text-sm text-muted-foreground">Showing {filtered.length} categories (min {categoryUnitFilter || 0} units)</div>
                </div>
                <div style={{ width: '100%', height: 360 }}>
                  <ResponsiveContainer>
                    <BarChart data={filtered}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="units" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Top 5 Categories</h3>
                  <div className="space-y-2">
                    {source.sort((a, b) => b.units - a.units).slice(0, 5).map((category: any, index: number) => (
                      <div 
                        key={category.name} 
                        className="flex items-center justify-between p-2 border rounded cursor-pointer hover:shadow-md hover:border-blue-300 transition-all duration-200"
                        onClick={() => onCategoryClick(category.name)}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{index + 1}</Badge>
                          <div>
                            <div className="font-medium hover:text-blue-600 transition-colors">{category.name}</div>
                            <div className="text-xs text-muted-foreground">{(category.productCount || 0) > 0 ? category.productCount.toLocaleString() + ' products' : '—'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{category.units.toLocaleString()} units</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </CardContent>
    </Card>
  )
})

CategoryBreakdownTab.displayName = 'CategoryBreakdownTab'
