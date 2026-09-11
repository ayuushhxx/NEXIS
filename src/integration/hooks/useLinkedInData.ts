import { useCallback, useEffect, useMemo, useState } from 'react'

export interface LinkedInProfileDigest {
  id: string
  name: string
  headline: string
}

interface UseLinkedInDataResult {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
  isLoading: boolean
  error: string | null
  connectUrl: string
  importProfilePdf: (file: File) => Promise<{ bullets: string[], extractedTextLength: number }>
}

const STORAGE_KEY = 'forge-linkedin-token'

export function useLinkedInData(): UseLinkedInDataResult {
  const [token, setTokenState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = params.get('linkedin_token')
    const err = params.get('linkedin_error')
    
    if (err) {
      setError(err)
    }
    
    const incoming = fromQuery
    if (!incoming) return

    setTokenState(incoming)
    try {
      localStorage.setItem(STORAGE_KEY, incoming)
    } catch {
      // Ignore storage failures.
    }

    const clean = new URL(window.location.href)
    clean.searchParams.delete('linkedin_token')
    clean.searchParams.delete('linkedin_error')
    window.history.replaceState({}, '', clean.toString())
  }, [])

  const setToken = useCallback((nextToken: string) => {
    const normalized = nextToken.trim()
    setTokenState(normalized)
    try {
      localStorage.setItem(STORAGE_KEY, normalized)
    } catch {
      // Ignore storage failures in private contexts.
    }
  }, [])

  const clearToken = useCallback(() => {
    setTokenState(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore storage failures in private contexts.
    }
  }, [])

  const connectUrl = useMemo(() => {
    // In a real app we'd pass the actual trainee ID here from auth state.
    // Assuming 'dev_trainee_1' or similar for this implementation.
    return '/api/linkedin/oauth/start?traineeId=dev_trainee_1'
  }, [])

  const importProfilePdf = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('profilePdf', file)
      
      const res = await fetch('/api/linkedin/import-profile-pdf', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error(`Profile import failed (${res.status}).`)
      }

      const payload = await res.json()
      return { bullets: payload.bullets || [], extractedTextLength: payload.extractedTextLength || 0 }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import LinkedIn profile.')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    token,
    setToken,
    clearToken,
    isLoading,
    error,
    connectUrl,
    importProfilePdf,
  }
}
