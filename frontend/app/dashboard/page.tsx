import { redirect } from "next/navigation"

export default function DashboardPage() {
  // Redirect to stock management as the main dashboard
  redirect("/dashboard/stock")
}
