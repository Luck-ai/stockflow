import { InventorySummary } from "@/components/inventory"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Inventory Summary | Stock Management",
  description: "High-level overview of your clothing inventory performance and health metrics",
}

export default function InventoryPage() {
  return <InventorySummary />
}