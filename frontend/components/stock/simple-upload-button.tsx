"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, FileText, Loader2, Package } from "lucide-react"
import { uploadSalesData, uploadStockData, uploadSkusData } from "@/lib/api"
import { useAppToast } from "@/lib/use-toast"
import UploadOverlay from "@/components/ui/upload-overlay"

interface SimpleUploadButtonProps {
  onUploadComplete?: () => void
}

export function SimpleUploadButton({ onUploadComplete }: SimpleUploadButtonProps) {
  const [isUploadingSales, setIsUploadingSales] = useState(false)
  const [isUploadingStock, setIsUploadingStock] = useState(false)
  const [isUploadingPO, setIsUploadingPO] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const salesInputRef = useRef<HTMLInputElement>(null)
  const stockInputRef = useRef<HTMLInputElement>(null)
  const poInputRef = useRef<HTMLInputElement>(null)
  const { push } = useAppToast()

  const isUploading = isUploadingSales || isUploadingStock || isUploadingPO

  const simulateProgress = (onComplete: () => void) => {
    setUploadProgress(0)
    const progressTimer = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressTimer)
          return 90
        }
        return prev + Math.random() * 15
      })
    }, 200)

    return () => {
      clearInterval(progressTimer)
      setUploadProgress(100)
      setTimeout(() => {
        setUploadProgress(0)
        onComplete()
      }, 500)
    }
  }

  const handleSalesUploadClick = () => {
    salesInputRef.current?.click()
  }

  const handleStockUploadClick = () => {
    stockInputRef.current?.click()
  }

  const handlePOUploadClick = () => {
    poInputRef.current?.click()
  }

  const handleSalesFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length === 0) return

    setIsUploadingSales(true)
    const completeProgress = simulateProgress(() => setIsUploadingSales(false))

    let totalInserted = 0
    const failures: string[] = []

    for (const file of files) {
      try {
        const result = await uploadSalesData(file)
        totalInserted += result.rows_inserted || 0
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    completeProgress()

    if (failures.length === 0) {
      push({
        title: "Sales Data Upload Successful",
        description: `Uploaded ${files.length} file(s). Inserted ${totalInserted} rows.`,
        variant: "success"
      })
    } else {
      push({
        title: "Sales Data Upload Partially Failed",
        description: `Inserted ${totalInserted} rows. ${failures.length} file(s) failed. See console for details.`,
        variant: "error"
      })
      // eslint-disable-next-line no-console
      console.error('Sales upload failures:', failures)
    }

    if (onUploadComplete) onUploadComplete()
    if (salesInputRef.current) salesInputRef.current.value = ''
  }

  const handleStockFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length === 0) return

    setIsUploadingStock(true)
    const completeProgress = simulateProgress(() => setIsUploadingStock(false))

    let totalInserted = 0
    const failures: string[] = []

    for (const file of files) {
      try {
        const result = await uploadStockData(file)
        totalInserted += result.rows_inserted || 0
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    completeProgress()

    if (failures.length === 0) {
      push({
        title: "Stock Data Upload Successful",
        description: `Uploaded ${files.length} file(s). Inserted ${totalInserted} rows.`,
        variant: "success"
      })
    } else {
      push({
        title: "Stock Data Upload Partially Failed",
        description: `Inserted ${totalInserted} rows. ${failures.length} file(s) failed. See console for details.`,
        variant: "error"
      })
      // eslint-disable-next-line no-console
      console.error('Stock upload failures:', failures)
    }

    if (onUploadComplete) onUploadComplete()
    if (stockInputRef.current) stockInputRef.current.value = ''
  }

  const handlePOFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingPO(true)
    const completeProgress = simulateProgress(() => setIsUploadingPO(false))

    try {
      const result = await uploadSkusData(file)
      
      completeProgress()
      
      push({
        title: "SKUs Data Upload Successful",
        description: `${result.message}. Inserted ${result.rows_inserted} rows.`,
        variant: "success"
      })

      if (onUploadComplete) {
        onUploadComplete()
      }

      if (poInputRef.current) {
        poInputRef.current.value = ''
      }

    } catch (error) {
      completeProgress()
      push({
        title: "SKUs Data Upload Failed",
        description: error instanceof Error ? error.message : 'Upload failed. Please try again.',
        variant: "error"
      })
    }
  }

  return (
    <>
      {isUploading && (
        <UploadOverlay 
          message={
            isUploadingSales ? 'Uploading sales data...' : 
            isUploadingStock ? 'Uploading stock data...' : 
            'Uploading SKUs data...'
          } 
          progress={uploadProgress}
          showProgress={true}
        />
      )}
      
      <input
        ref={salesInputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls"
        onChange={handleSalesFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={stockInputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls"
        onChange={handleStockFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={poInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handlePOFileChange}
        style={{ display: 'none' }}
      />

      <div className="flex gap-3">
        <Button 
          onClick={handleSalesUploadClick}
          disabled={isUploading}
          className="btn-corporate shadow-lg"
        >
          {isUploadingSales ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          {isUploadingSales ? 'Uploading...' : 'Upload Sales Data'}
        </Button>

        <Button 
          onClick={handleStockUploadClick}
          disabled={isUploading}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow-lg"
        >
          {isUploadingStock ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {isUploadingStock ? 'Uploading...' : 'Upload Stock Data'}
        </Button>

        <Button 
          onClick={handlePOUploadClick}
          disabled={isUploading}
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg"
        >
          {isUploadingPO ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Package className="mr-2 h-4 w-4" />
          )}
          {isUploadingPO ? 'Uploading...' : 'Upload SKUs Data'}
        </Button>
      </div>
    </>
  )
}