"use client"

import React, { useState, useEffect } from 'react'
import { Loader2, Upload, CheckCircle } from 'lucide-react'
import { Progress } from './progress'

interface UploadOverlayProps {
  message?: string
  progress?: number
  showProgress?: boolean
}

export default function UploadOverlay({ 
  message = 'Uploading data...', 
  progress = 50,
  showProgress = true 
}: UploadOverlayProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  
  const steps = [
    'Preparing file...',
    'Uploading to server...',
    'Validating data...',
    'Processing records...',
    'Finalizing upload...'
  ]

  useEffect(() => {
    // Animate progress smoothly
    const timer = setInterval(() => {
      setAnimatedProgress(prev => {
        if (prev < progress) {
          return Math.min(prev + 2, progress)
        }
        return prev
      })
    }, 100)

    return () => clearInterval(timer)
  }, [progress])

  useEffect(() => {
    // Cycle through steps to show activity
    const stepTimer = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % steps.length)
    }, 1500)

    return () => clearInterval(stepTimer)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[480px] bg-white rounded-lg p-8 shadow-xl border border-gray-200 animate-in fade-in-0 zoom-in-95 duration-300">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-blue-50 rounded-full border border-blue-200">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
          <div>
            <div className="font-semibold text-lg text-gray-900">{message}</div>
            <div className="text-sm text-gray-600 mt-1">Please wait while we process your file.</div>
          </div>
        </div>
        
        {showProgress && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{steps[currentStep]}</span>
                <span className="text-gray-500">{Math.round(animatedProgress)}%</span>
              </div>
              <Progress value={animatedProgress} className="h-2" />
            </div>
            
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Upload className="h-3 w-3" />
              <span>Processing data securely on server</span>
            </div>
          </div>
        )}
        
        <div className="mt-6 p-3 bg-gray-50 rounded-md">
          <p className="text-xs text-gray-600">
            💡 <strong>Tip:</strong> Large files may take longer to process. The upload will continue even if you navigate away.
          </p>
        </div>
      </div>
    </div>
  )
}
