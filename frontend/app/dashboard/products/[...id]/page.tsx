import { ProductDetails } from "@/components/products/product-details"

interface ProductPageProps {
  params: Promise<{
    id: string | string[]
  }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params
  // If catch-all route matched multiple segments, join them with '/'
  const sku = Array.isArray(id) ? id.join('/') : id
  return <ProductDetails productId={sku} />
}
