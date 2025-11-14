import { ProductDetails } from "@/components/products/product-details"

interface ProductPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params
  const decoded = decodeURIComponent(id)
  return <ProductDetails productId={decoded} />
}
