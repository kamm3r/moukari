import { useEffect, useState } from 'react'

type OpenCV = any

let cvInstance: OpenCV | null = null
let loadingPromise: Promise<void> | null = null
let loadError: string | null = null

function getWasmUrl(): string {
  // Works with non-root deployments too (BASE_URL)
  const base = import.meta.env.BASE_URL ?? '/'
  const url = new URL(`${base}opencv/opencv_js.wasm`, window.location.href)
  return url.toString()
}

function configureEmscriptenLocateFileOnce() {
  if (typeof window === 'undefined') return

  const g = globalThis as any
  if (g.__OPENCV_LOCATEFILE_CONFIGURED__) return

  const wasmUrl = getWasmUrl()

  g.Module = g.Module ?? {}
  const prev = g.Module.locateFile

  g.Module.locateFile = (path: string, prefix?: string) => {
    if (path.endsWith('.wasm')) return wasmUrl
    if (typeof prev === 'function') return prev(path, prefix)
    return (prefix ?? '') + path
  }

  g.__OPENCV_LOCATEFILE_CONFIGURED__ = true
}

async function resolveTechstarkExport(modNs: any): Promise<OpenCV> {
  const maybe = modNs?.default ?? modNs
  if (maybe && typeof maybe.then === 'function') return await maybe
  return maybe
}

async function waitForMat(cv: OpenCV, timeoutMs: number) {
  const start = Date.now()
  while (true) {
    if (cv && typeof cv.Mat === 'function') return
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        'OpenCV runtime did not initialize (Mat not available). ' +
          'Check that /opencv/opencv_js.wasm is reachable.',
      )
    }
    await new Promise((r) => setTimeout(r, 25))
  }
}

async function loadOpenCVInternal(): Promise<void> {
  console.log('[OpenCV] Starting OpenCV load...')
  configureEmscriptenLocateFileOnce()

  const importPromise = import('@techstark/opencv-js').then(async (mod) => {
    console.log('[OpenCV] Import resolved, resolving export...')
    const cv = await resolveTechstarkExport(mod)
    console.log('[OpenCV] Export resolved, waiting for Mat...')
    await waitForMat(cv, 60000)
    cvInstance = cv
    console.log('[OpenCV] Runtime ready ✓')
  })

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('OpenCV load timeout (60s)')), 60000)
  })

  await Promise.race([importPromise, timeoutPromise])
}

export function useOpenCV() {
  const [isLoaded, setIsLoaded] = useState<boolean>(() => {
    return Boolean(cvInstance && typeof (cvInstance as any).Mat === 'function')
  })
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
    if (!loadingPromise) loadingPromise = loadOpenCVInternal()

    loadingPromise
      .then(() => setIsLoaded(true))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load OpenCV'
        loadError = msg
        setError(msg)
      })
  }, [])

  return { isLoaded, error, cv: cvInstance }
}

export async function loadOpenCV(): Promise<void> {
  if (cvInstance) return
  if (loadError) throw new Error(loadError)
  if (!loadingPromise) loadingPromise = loadOpenCVInternal()
  return loadingPromise
}

export function isOpenCVLoaded(): boolean {
  return Boolean(cvInstance && typeof (cvInstance as any).Mat === 'function')
}

export function getOpenCVError(): string | null {
  return loadError
}

export function getOpenCV(): OpenCV | null {
  return cvInstance
}