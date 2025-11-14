"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, Bell, BellOff, Package, Clock, CheckCircle, X, TestTube, RotateCcw, Send } from "lucide-react"
import { useAppToast } from "@/lib/use-toast"
import { notificationManager } from "@/lib/notifications"

interface Notification {
  id: string
  type: "low_stock" | "out_of_stock" | "critical_stock"
  product: string
  sku: string
  currentStock: number
  threshold?: number
  category: string
  brand: string
  timestamp: string
  status: "active" | "resolved" | "dismissed"
  priority: "low" | "medium" | "high" | "critical"
  description: string
}


export function NotificationHistory() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<"all" | "active" | "resolved" | "dismissed">("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "low_stock" | "out_of_stock" | "critical_stock">("all")
  const [isTestingNotifications, setIsTestingNotifications] = useState(false)
  const [isTestingSummary, setIsTestingSummary] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default")
  const [isNotificationSupported, setIsNotificationSupported] = useState(false)
  const { push: pushToast } = useAppToast()

  // Initialize client-side only features
  useEffect(() => {
    setIsClient(true)
    
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsNotificationSupported(true)
      setNotificationPermission(Notification.permission)
      
      // Listen for permission changes
      const checkPermission = () => {
        setNotificationPermission(Notification.permission)
      }
      
      // Check permission periodically in case it changes
      const interval = setInterval(checkPermission, 1000)
      return () => clearInterval(interval)
    }
  }, [])

  // Filter notifications based on status and type
  const filteredNotifications = notifications.filter(notification => {
    const statusMatch = filter === "all" || notification.status === filter
    const typeMatch = typeFilter === "all" || notification.type === typeFilter
    return statusMatch && typeMatch
  })

  // Get notification counts
  const counts = {
    total: notifications.length,
    active: notifications.filter(n => n.status === "active").length,
    resolved: notifications.filter(n => n.status === "resolved").length,
    dismissed: notifications.filter(n => n.status === "dismissed").length,
    critical: notifications.filter(n => n.priority === "critical" && n.status === "active").length
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>
      case "high":
        return <Badge variant="destructive">High</Badge>
      case "medium":
        return <Badge variant="secondary">Medium</Badge>
      case "low":
        return <Badge variant="outline">Low</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "out_of_stock":
        return <Badge variant="destructive">Out of Stock</Badge>
      case "critical_stock":
        return <Badge variant="destructive">Critical Stock</Badge>
      case "low_stock":
        return <Badge variant="secondary">Low Stock</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Active</Badge>
      case "resolved":
        return <Badge variant="outline" className="text-green-600 border-green-600">Resolved</Badge>
      case "dismissed":
        return <Badge variant="outline" className="text-gray-600 border-gray-600">Dismissed</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const handleResolve = (id: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id 
          ? { ...notification, status: "resolved" as const }
          : notification
      )
    )
    pushToast({
      title: "Notification Resolved",
      description: "The stock issue has been marked as resolved.",
      variant: "success"
    })
  }

  const handleDismiss = (id: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id 
          ? { ...notification, status: "dismissed" as const }
          : notification
      )
    )
    pushToast({
      title: "Notification Dismissed",
      description: "The notification has been dismissed.",
      variant: "default"
    })
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  // Simulate desktop notifications for active stock alerts (client-side only)
  useEffect(() => {
    if (isClient && isNotificationSupported && notificationPermission === "granted") {
      const activeAlerts = notifications.filter(n => n.status === "active" && n.priority === "critical")
      activeAlerts.forEach(alert => {
        new Notification(`Stock Alert: ${alert.product}`, {
          body: alert.description,
          icon: "/favicon.ico"
        })
      })
    }
  }, [isClient, isNotificationSupported, notificationPermission, notifications])

  const requestNotificationPermission = async () => {
    if (isNotificationSupported) {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      
      if (permission === "granted") {
        pushToast({
          title: "Notifications Enabled",
          description: "You will now receive desktop notifications for critical stock alerts.",
          variant: "success"
        })
      } else {
        pushToast({
          title: "Notifications Denied",
          description: "Desktop notifications are disabled. Enable them in your browser settings.",
          variant: "error"
        })
      }
    }
  }

  const testNotificationSystem = async () => {
    setIsTestingNotifications(true)
    
    try {
      // Request permission if needed
      if (isNotificationSupported && notificationPermission === "default") {
        await requestNotificationPermission()
      }
      
      if (isNotificationSupported && notificationPermission === "granted") {
        // Test different types of notifications with delays
        const testNotifications = [
          {
            title: "🟡 Test: Low Stock Alert",
            body: "Classic White T-Shirt (M): Stock is low (8 items)",
            delay: 0
          },
          {
            title: "⚠️ Test: Critical Stock Alert", 
            body: "Slim Fit Jeans (32W): Critical stock level (3 items)",
            delay: 2000
          },
          {
            title: "🔴 Test: Out of Stock Alert",
            body: "Cotton Hoodie (L): Product is completely out of stock",
            delay: 4000
          }
        ]
        
        testNotifications.forEach(({ title, body, delay }) => {
          setTimeout(() => {
            const notification = new Notification(title, {
              body,
              icon: "/favicon.ico",
              requireInteraction: title.includes("Critical") || title.includes("Out of Stock")
            })
            
            notification.onclick = () => {
              window.focus()
              notification.close()
            }
            
            // Auto-close non-critical notifications
            if (!title.includes("Critical") && !title.includes("Out of Stock")) {
              setTimeout(() => notification.close(), 5000)
            }
          }, delay)
        })
        
        pushToast({
          title: "Testing Notifications",
          description: "3 test notifications will be sent over 6 seconds.",
          variant: "success"
        })
        
      } else {
        pushToast({
          title: "Notifications Disabled",
          description: "Please enable notifications first to test the system.",
          variant: "error"
        })
      }
    } catch (error) {
      pushToast({
        title: "Test Failed",
        description: "Could not test notification system.",
        variant: "error"
      })
    } finally {
      setTimeout(() => setIsTestingNotifications(false), 6000)
    }
  }

  const testSummaryNotification = async () => {
    setIsTestingSummary(true)
    try {
      const permission = await notificationManager.requestPermission()
      
      if (permission === "granted") {
        // Reset the first-run flag to allow summary testing
        notificationManager.resetFirstRunFlag()
        
        // Trigger summary notification using the notification manager. Replace with real stock data source as needed.
        notificationManager.checkStockLevels([])
        pushToast({
          title: "Summary Test Sent",
          description: "Stock summary notification triggered (no mock data).",
          variant: "success"
        })
      } else {
        pushToast({
          title: "Permission Denied",
          description: "Cannot test notifications without permission.",
          variant: "error"
        })
      }
    } catch (error) {
      pushToast({
        title: "Test Failed",
        description: "Could not test summary notification system.",
        variant: "error"
      })
    } finally {
      setTimeout(() => setIsTestingSummary(false), 2000)
    }
  }

  const resendNotification = (notification: Notification) => {
    if (isNotificationSupported && notificationPermission === "granted") {
      const title = `🔄 Resent: ${notification.type.replace("_", " ").toUpperCase()}`
      const body = `${notification.product}: ${notification.description}`
      
      const desktopNotification = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: `resend-${notification.id}`,
        requireInteraction: notification.priority === "critical"
      })
      
      desktopNotification.onclick = () => {
        window.focus()
        desktopNotification.close()
      }
      
      pushToast({
        title: "Notification Resent",
        description: `Desktop notification resent for ${notification.product}`,
        variant: "success"
      })
    } else {
      pushToast({
        title: "Cannot Resend",
        description: "Desktop notifications are not enabled.",
        variant: "error"
      })
    }
  }
  
  const resendAllCritical = () => {
    const criticalNotifications = notifications.filter(n => 
      n.status === "active" && (n.priority === "critical" || n.type === "out_of_stock")
    )
    
    if (criticalNotifications.length === 0) {
      pushToast({
        title: "No Critical Alerts",
        description: "There are no active critical notifications to resend.",
        variant: "default"
      })
      return
    }
    
    if (isNotificationSupported && notificationPermission === "granted") {
      criticalNotifications.forEach((notification, index) => {
        setTimeout(() => {
          resendNotification(notification)
        }, index * 1000) // Stagger by 1 second
      })
      
      pushToast({
        title: "Resending Critical Alerts",
        description: `Resending ${criticalNotifications.length} critical notifications.`,
        variant: "success"
      })
    } else {
      pushToast({
        title: "Cannot Resend",
        description: "Desktop notifications are not enabled.",
        variant: "error"
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notification History</h1>
          <p className="text-muted-foreground">Track and manage stock level notifications</p>
        </div>
        <div className="flex items-center space-x-2">
          {isClient && (
            <>
              <Button 
                variant="outline" 
                onClick={requestNotificationPermission}
                className="flex items-center space-x-2"
                disabled={!isNotificationSupported || notificationPermission === "granted"}
              >
                <Bell className="h-4 w-4" />
                <span>
                  {notificationPermission === "granted" 
                    ? "Notifications Enabled" 
                    : "Enable Notifications"}
                </span>
              </Button>
              
              <Button 
                variant="outline"
                onClick={testNotificationSystem}
                disabled={isTestingNotifications}
                className="flex items-center space-x-2"
              >
                <TestTube className="h-4 w-4" />
                <span>{isTestingNotifications ? "Testing..." : "Test Notifications"}</span>
              </Button>
              
              <Button 
                variant="outline"
                onClick={testSummaryNotification}
                disabled={isTestingSummary}
                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
              >
                <Package className="h-4 w-4" />
                <span>{isTestingSummary ? "Testing..." : "Test Summary"}</span>
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {
                  notificationManager.resetFirstRunFlag()
                  pushToast({
                    title: "First-Run Reset",
                    description: "Summary notifications will show again on next stock check.",
                    variant: "success"
                  })
                }}
                className="flex items-center space-x-2 text-green-600 hover:text-green-700"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset First-Run</span>
              </Button>
              
              <Button 
                variant="outline"
                onClick={resendAllCritical}
                disabled={counts.critical === 0}
                className="flex items-center space-x-2 text-red-600 hover:text-red-700"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Resend Critical ({counts.critical})</span>
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Notification Status Info */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {isClient ? (
                isNotificationSupported ? (
                  notificationPermission === "granted" ? (
                    <>
                      <Bell className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-600 font-medium">Desktop notifications enabled</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="h-4 w-4 text-orange-600" />
                      <span className="text-sm text-orange-600 font-medium">Desktop notifications disabled</span>
                    </>
                  )
                ) : (
                  <>
                    <BellOff className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-red-600 font-medium">Browser notifications not supported</span>
                  </>
                )
              ) : (
                <>
                  <Bell className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-400 font-medium">Loading notification status...</span>
                </>
              )}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredNotifications.length} of {notifications.length} notifications shown
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Notifications</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.total}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{counts.active}</div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{counts.critical}</div>
            <p className="text-xs text-muted-foreground">Immediate action needed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{counts.resolved}</div>
            <p className="text-xs text-muted-foreground">Issues resolved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dismissed</CardTitle>
            <X className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{counts.dismissed}</div>
            <p className="text-xs text-muted-foreground">Manually dismissed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div>
          <label className="text-sm font-medium">Status:</label>
          <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
            <SelectTrigger className="w-[150px] ml-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <label className="text-sm font-medium">Type:</label>
          <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
            <SelectTrigger className="w-[180px] ml-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              <SelectItem value="critical_stock">Critical Stock</SelectItem>
              <SelectItem value="low_stock">Low Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notifications Table */}
      <Card>
        <CardHeader>
          <CardTitle>Notification History</CardTitle>
          <CardDescription>
            View and manage all stock level notifications. Critical alerts trigger desktop notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Stock Level</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNotifications.map((notification) => (
                <TableRow key={notification.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{notification.product}</div>
                      <div className="text-sm text-muted-foreground">SKU: {notification.sku}</div>
                    </div>
                  </TableCell>
                  <TableCell>{getTypeBadge(notification.type)}</TableCell>
                  <TableCell>{getPriorityBadge(notification.priority)}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span>{notification.currentStock}</span>
                      {notification.threshold && (
                        <span className="text-muted-foreground">/ {notification.threshold}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{notification.category}</TableCell>
                  <TableCell>{notification.brand}</TableCell>
                  <TableCell>{getStatusBadge(notification.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{formatTimestamp(notification.timestamp)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {notification.status === "active" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResolve(notification.id)}
                            title="Mark as resolved"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDismiss(notification.id)}
                            title="Dismiss notification"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resendNotification(notification)}
                        title="Resend desktop notification"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}