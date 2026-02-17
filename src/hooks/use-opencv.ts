import { useState, useEffect } from 'react'

let cvInstance: typeof import('@techstark/opencv-js') | null = null
let loadingPromise: Promise<void> | null = null
let loadError: string | null = null

export function useOpenCV() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(loadError)

  useEffect(() => {
    if (cvInstance) {
      setIsLoaded(true)
      return
    }

    if (loadError) {
      setError(loadError)
      return
    }

    if (!loadingPromise) {
      loadingPromise = loadOpenCVInternal()
    }

    loadingPromise
      .then(() => {
        setIsLoaded(true)
      })
      .catch((err) => {
        const errorMsg =
          err instanceof Error ? err.message : 'Failed to load OpenCV'
        loadError = errorMsg
        setError(errorMsg)
      })
  }, [])

  return { isLoaded, error, cv: cvInstance }
}

async function loadOpenCVInternal(): Promise<void> {
  // Add timeout for OpenCV loading - it can take a while and freeze on weak hardware
  const loadPromise = import('@techstark/opencv-js')
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error('OpenCV load timeout - library is too large for this device'),
      )
    }, 30000) // 30 second timeout
  })

  const cv = await Promise.race([loadPromise, timeoutPromise])
  cvInstance = cv
}

// Export for on-demand loading
export async function loadOpenCV(): Promise<void> {
  if (cvInstance) return
  if (loadError) throw new Error(loadError)
  if (!loadingPromise) {
    loadingPromise = loadOpenCVInternal()
  }
  return loadingPromise
}

export function isOpenCVLoaded(): boolean {
  return cvInstance !== null
}

export function getOpenCVError(): string | null {
  return loadError
}

export function getOpenCV() {
  return cvInstance
}
