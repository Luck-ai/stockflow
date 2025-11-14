"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch } from '@/lib/api'
import { Loader2 } from "lucide-react"

type UploadCSVProps = {
  url: string
  label?: string
  accept?: string
}

export default function UploadCSV({ url, label = "Upload CSV", accept = ".csv" }: UploadCSVProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setResults(null)
    setError(null)
    const f = e.target.files?.[0] ?? null
    setFile(f)
  }

  const upload = async () => {
    if (!file) return
    setLoading(true)
    setResults(null)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch(url, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const errorText = await res.text()
        let errorMessage = errorText || res.statusText
        try {
          const errorJson = JSON.parse(errorText)
          if (errorJson.detail) {
            errorMessage = errorJson.detail
          }
        } catch {
          // Use the text as is
        }
        throw new Error(errorMessage)
      }
      const data = await res.json()
      const resultsData = data.results ?? data
      setResults(resultsData)
      // Emit a global event so other parts of the app can react (e.g., refresh tables)
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          const ev = new CustomEvent('csv:uploaded', { detail: { url, results: resultsData } })
          window.dispatchEvent(ev)
        }
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Hidden native input for accessibility, we use a styled label as the visible chooser */}
        <input
          id="upload-csv-input"
          type="file"
          accept={accept}
          onChange={onFileChange}
          className="sr-only"
        />

        <label
          htmlFor="upload-csv-input"
          className="inline-flex items-center px-3 py-2 rounded-md border bg-background hover:bg-accent/50 text-sm cursor-pointer"
        >
          Choose File
        </label>

        <span className="text-sm text-muted-foreground min-w-0 break-words">
          {file ? file.name : 'No file chosen'}
        </span>

        <div className="ml-auto">
          <Button onClick={upload} disabled={!file || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Uploading...' : label}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Uploading and processing file...</span>
        </div>
      ) : null}
      {error ? <div className="text-red-600">{error}</div> : null}

      {results ? (
        <div className="mt-2 max-h-56 overflow-auto bg-muted p-2 rounded">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Row</th>
                <th className="text-left">Status</th>
                <th className="text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r: any, idx: number) => (
                <tr key={idx} className="border-t">
                  <td className="py-1 align-top">{r.row ?? idx + 1}</td>
                  <td className="py-1 align-top">{r.ok ? 'OK' : 'Error'}</td>
                  <td className="py-1 align-top break-words">{r.error ?? (r.product_id ?? r.category_id ?? r.supplier_id ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
