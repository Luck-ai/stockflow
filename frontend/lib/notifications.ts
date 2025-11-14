// Notification utility for desktop notifications
export class NotificationManager {
  private static instance: NotificationManager
  private permission: NotificationPermission = "default"

  private constructor() {
    // Only initialize on client-side to prevent SSR hydration issues
    if (typeof window !== "undefined" && "Notification" in window) {
      this.permission = Notification.permission
    } else {
      this.permission = "denied"
    }
  }

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager()
    }
    return NotificationManager.instance
  }

  async requestPermission(): Promise<NotificationPermission> {
    // Return early on server-side
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied"
    }

    if (this.permission === "default") {
      this.permission = await Notification.requestPermission()
    }
    return this.permission
  }

  canShowNotification(): boolean {
    return typeof window !== "undefined" && 
           "Notification" in window && 
           this.permission === "granted"
  }

  showStockAlert(product: string, message: string, type: "low_stock" | "out_of_stock" | "critical_stock" | "stock_summary") {
    if (!this.canShowNotification()) {
      return
    }

    const title = this.getNotificationTitle(type)
    const options: NotificationOptions = {
      body: `${product}: ${message}`,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: `stock-alert-${type}`,
      requireInteraction: type === "out_of_stock" || type === "critical_stock" || type === "stock_summary"
    }

    const notification = new Notification(title, options)

    notification.onclick = () => {
      window.focus()
      // Navigate based on notification type
      if (type === "stock_summary") {
        window.location.href = "/dashboard/stock?filter=out"
      } else {
        window.location.href = "/dashboard/notifications"
      }
      notification.close()
    }

    // Auto-close notification after 10 seconds for non-critical alerts
    if (type === "low_stock") {
      setTimeout(() => {
        notification.close()
      }, 10000)
    }

    return notification
  }

  private getNotificationTitle(type: string): string {
    switch (type) {
      case "out_of_stock":
        return "🔴 Out of Stock Alert"
      case "critical_stock":
        return "⚠️ Critical Stock Alert"
      case "low_stock":
        return "🟡 Low Stock Alert"
      case "stock_summary":
        return "📊 Stock Alert Summary"
      default:
        return "📦 Stock Alert"
    }
  }

  showBulkAlert(count: number, type: "low_stock" | "out_of_stock" | "critical_stock") {
    if (!this.canShowNotification()) {
      return
    }

    const title = `${count} ${type.replace("_", " ")} alerts`
    const message = `You have ${count} products that require attention`

    const notification = new Notification(title, {
      body: message,
      icon: "/favicon.ico",
      tag: `bulk-alert-${type}`,
      requireInteraction: true
    })

    notification.onclick = () => {
      window.focus()
      window.location.href = "/dashboard/notifications"
      notification.close()
    }

    return notification
  }

  getPermissionStatus(): NotificationPermission {
    return this.permission
  }
  
  isNotificationSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window
  }
  
  // Test notification system with sample alerts
  async testNotificationSystem(): Promise<boolean> {
    const permission = await this.requestPermission()
    
    if (permission !== "granted") {
      return false
    }
    
    const testAlerts = [
      {
        title: "🟡 Test: Low Stock Alert",
        body: "Classic White T-Shirt (M): Stock is low (8/15 threshold)",
        type: "low_stock" as const,
        delay: 0
      },
      {
        title: "⚠️ Test: Critical Stock Alert",
        body: "Slim Fit Jeans (32W): Critical stock level (3/10 threshold)", 
        type: "critical_stock" as const,
        delay: 2000
      },
      {
        title: "🔴 Test: Out of Stock Alert",
        body: "Cotton Hoodie (L): Product is completely out of stock",
        type: "out_of_stock" as const,
        delay: 4000
      }
    ]
    
    testAlerts.forEach(({ title, body, type, delay }) => {
      setTimeout(() => {
        const notification = new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag: `test-${type}-${Date.now()}`,
          requireInteraction: type === "out_of_stock" || type === "critical_stock"
        })
        
        notification.onclick = () => {
          window.focus()
          notification.close()
        }
        
        // Auto-close low stock notifications
        if (type === "low_stock") {
          setTimeout(() => notification.close(), 5000)
        }
      }, delay)
    })
    
    return true
  }
  
  // Resend a specific notification
  resendNotification(productName: string, message: string, type: "low_stock" | "out_of_stock" | "critical_stock" | "stock_summary"): boolean {
    if (!this.canShowNotification()) {
      return false
    }
    
    const title = `🔄 Resent: ${this.getNotificationTitle(type)}`
    
    const notification = new Notification(title, {
      body: `${productName}: ${message}`,
      icon: "/favicon.ico",
      tag: `resend-${type}-${Date.now()}`,
      requireInteraction: type === "out_of_stock" || type === "critical_stock" || type === "stock_summary"
    })
    
    notification.onclick = () => {
      window.focus()
      window.location.href = "/dashboard/notifications"
      notification.close()
    }
    
    return true
  }
  
  // Resend all active notifications for critical items
  resendCriticalAlerts(products: Array<{
    name: string
    currentStock: number
    threshold: number
    category: string
  }>): number {
    if (!this.canShowNotification()) {
      return 0
    }
    
    const criticalItems = products.filter(p => p.currentStock === 0 || p.currentStock <= Math.floor(p.threshold * 0.5))
    
    criticalItems.forEach((item, index) => {
      setTimeout(() => {
        const type = item.currentStock === 0 ? "out_of_stock" : "critical_stock"
        const message = item.currentStock === 0 
          ? "Product is completely out of stock"
          : `Critical stock level: ${item.currentStock} items (threshold: ${item.threshold})`
          
        this.resendNotification(item.name, message, type)
      }, index * 1000) // Stagger notifications by 1 second
    })
    
    return criticalItems.length
  }
  checkStockLevels(products: Array<{
    id: string
    name: string
    currentStock: number
    threshold: number
    category: string
  }>) {
    // Only send notifications on first app run
    const hasShownStockSummary = localStorage.getItem('stockSummaryShown')
    if (hasShownStockSummary) {
      return // Don't show notifications if already shown this session
    }

    const lowStockItems = products.filter(p => p.currentStock > 0 && p.currentStock <= p.threshold)
    const outOfStockItems = products.filter(p => p.currentStock === 0)
    const criticalStockItems = products.filter(p => p.currentStock > 0 && p.currentStock <= Math.floor(p.threshold * 0.5))

    // Create summary notification instead of individual ones
    const totalIssues = criticalStockItems.length + outOfStockItems.length + lowStockItems.length
    
    if (totalIssues > 0) {
      let summaryTitle = "Stock Alert Summary"
      let summaryDetails = []
      
      if (criticalStockItems.length > 0) {
        summaryDetails.push(`🔴 ${criticalStockItems.length} critical stock item${criticalStockItems.length > 1 ? 's' : ''}`)
      }
      
      if (outOfStockItems.length > 0) {
        summaryDetails.push(`⚫ ${outOfStockItems.length} out of stock item${outOfStockItems.length > 1 ? 's' : ''}`)
      }
      
      if (lowStockItems.length > 0) {
        summaryDetails.push(`🟡 ${lowStockItems.length} low stock item${lowStockItems.length > 1 ? 's' : ''}`)
      }
      
      const summaryMessage = summaryDetails.join('\n')
      
      // Show the summary notification
      this.showStockAlert(
        summaryTitle,
        summaryMessage,
        "stock_summary"
      )
    }
    
    // Mark that summary has been shown for this session
    localStorage.setItem('stockSummaryShown', 'true')
  }

  // Reset first-run detection for testing purposes
  resetFirstRunFlag() {
    if (typeof window !== "undefined") {
      localStorage.removeItem('stockSummaryShown')
    }
  }
}

export const notificationManager = NotificationManager.getInstance()