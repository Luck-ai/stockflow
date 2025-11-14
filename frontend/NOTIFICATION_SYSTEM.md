# Notification System

## Overview
The notification system replaces the old restock management with a comprehensive notification history that tracks low stock and out-of-stock alerts with desktop notifications, testing capabilities, and resend functionality.

## Features

### Desktop Notifications
- **Critical Stock Alerts**: Immediate desktop notifications for out-of-stock items
- **Low Stock Warnings**: Notifications when items fall below threshold
- **Bulk Alerts**: Consolidated notifications when multiple items need attention
- **Permission Management**: Request and manage browser notification permissions
- **Test System**: Built-in notification testing with sample alerts
- **Resend Capability**: Resend missed notifications individually or in bulk

### Notification Testing
- **Test Button**: Send 3 sample notifications (Low Stock, Critical Stock, Out of Stock)
- **Automatic Permission**: Request browser permissions during testing
- **Staggered Delivery**: Test notifications sent 2 seconds apart
- **Real-time Feedback**: Toast messages confirm test completion
- **Permission Status**: Visual indicators show notification status

### Resend Functionality
- **Individual Resend**: Resend any notification with "Send" button
- **Bulk Critical Resend**: Resend all critical alerts with one click
- **Staggered Delivery**: Multiple resends spaced 1 second apart
- **Status Tracking**: Visual confirmation of resent notifications
- **Priority Focus**: Bulk resend targets critical and out-of-stock items only

### Notification History
- **Complete Audit Trail**: View all past and current stock notifications
- **Status Tracking**: Track notifications as active, resolved, or dismissed
- **Priority Levels**: Critical, High, Medium, Low priority classifications
- **Advanced Filtering**: Filter by status, type, category, and priority
- **Real-time Status**: Live browser notification permission status

### Integration
- **Automatic Monitoring**: Stock levels are automatically checked when loading inventory
- **Real-time Updates**: Notifications update in real-time as stock changes
- **Cross-Component**: Notifications work across all inventory management pages

## Usage

### Testing the Notification System
1. Click "Test Notifications" button in the notification history page
2. System will automatically request browser permissions if needed
3. Receive 3 sample notifications over 6 seconds:
   - 🟡 Low Stock Alert (auto-dismisses after 5 seconds)
   - ⚠️ Critical Stock Alert (requires manual dismissal)
   - 🔴 Out of Stock Alert (requires manual dismissal)
4. Click any test notification to focus the browser window

### Enabling Desktop Notifications
1. Click the "Enable Notifications" button in the notification history page
2. Accept the browser permission prompt
3. Button will show "Notifications Enabled" when active
4. Critical stock alerts will now appear as desktop notifications

### Resending Notifications
**Individual Resend:**
- Click the "Send" (📤) button next to any notification
- Desktop notification will be resent immediately
- Works for any notification regardless of status

**Bulk Critical Resend:**
- Click "Resend Critical" button in header (shows count)
- Resends all active critical and out-of-stock notifications
- Notifications are staggered 1 second apart to avoid spam
- Only available when critical alerts exist

### Managing Notifications
- **Active**: Notifications that require attention
- **Resolved**: Mark notifications as resolved when stock is replenished
- **Dismissed**: Dismiss notifications that don't require action (e.g., discontinued products)

### Notification Types
- **Out of Stock**: Products with 0 inventory (Critical priority)
- **Critical Stock**: Products below 50% of threshold (Critical priority)
- **Low Stock**: Products below threshold but above critical level (High/Medium priority)

### Header Controls
- **Enable Notifications**: Request browser permissions (disabled when already enabled)
- **Test Notifications**: Send sample notifications to test the system
- **Resend Critical**: Bulk resend all critical alerts (shows count, disabled when none)
- **Status Indicator**: Real-time browser notification permission status

### Desktop Notification Behavior
- **Critical Alerts**: Require user interaction to dismiss
- **Low Stock**: Auto-dismiss after 5-10 seconds
- **Test Notifications**: Clearly labeled with "Test:" prefix
- **Resent Notifications**: Labeled with "🔄 Resent:" prefix
- **Click Action**: Clicking notification opens the notification history page
- **Bulk Notifications**: When 3+ items have the same issue, shows bulk notification

## Technical Implementation

### Components
- `NotificationHistory`: Main notification management interface with testing and resend features
- `NotificationManager`: Utility class for handling desktop notifications, testing, and resending
- Integration in `StockManagement` for automatic monitoring

### Enhanced API Methods
```typescript
// Testing functionality
testNotificationSystem(): Promise<boolean>
resendNotification(productName: string, message: string, type: string): boolean
resendCriticalAlerts(products: Product[]): number

// Status checking
getPermissionStatus(): NotificationPermission
isNotificationSupported(): boolean
canShowNotification(): boolean
```

### Data Structure
```typescript
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
```

### Navigation
- Replaced "Restock" in dashboard navigation with "Notifications"
- Uses Bell icon instead of RefreshCw
- Same URL path (`/dashboard/restock`) for backward compatibility

## Browser Compatibility
- Chrome/Edge: Full support including persistent notifications
- Firefox: Full support with user permission
- Safari: Basic support (notifications may not persist)
- Mobile: Limited support depending on browser and OS

## Benefits over Previous Restock System
1. **Proactive Alerts**: No need to manually check for low stock
2. **Desktop Integration**: Notifications work even when browser is in background
3. **Better Tracking**: Complete history of all stock alerts
4. **Priority Management**: Focus on critical issues first
5. **Clothing-Specific**: Tailored for fashion inventory with size/brand tracking
6. **Action Management**: Clear workflow for resolving stock issues

## Future Enhancements
- Email notifications for critical alerts
- Slack/Teams integration
- Automated restock suggestions
- Threshold adjustment recommendations
- Mobile push notifications (with PWA)