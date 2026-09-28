import { useState, useRef, useCallback, useEffect } from 'react'
import { api } from './api'

interface UseSharedTextOptions {
  roomId: string
  initialContent: string
  initialVersion: number
  pollInterval?: number  // default 2000ms
  saveDelay?: number     // default 800ms
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseSharedTextReturn {
  text: string
  setText: (text: string) => void
  saveStatus: SaveStatus
  version: number
}

export function useSharedText({
  roomId,
  initialContent,
  initialVersion,
  pollInterval = 2000,
  saveDelay = 800
}: UseSharedTextOptions): UseSharedTextReturn {
  const [text, setTextState] = useState(initialContent)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [version, setVersion] = useState(initialVersion)

  const pendingSaveRef = useRef<NodeJS.Timeout | null>(null)
  const isTypingRef = useRef(false)
  const currentVersionRef = useRef(initialVersion)

  // Keep ref in sync
  useEffect(() => {
    currentVersionRef.current = version
  }, [version])

  const setText = useCallback((newText: string) => {
    setTextState(newText)
    isTypingRef.current = true

    if (pendingSaveRef.current) {
      clearTimeout(pendingSaveRef.current)
    }

    pendingSaveRef.current = setTimeout(async () => {
      isTypingRef.current = false
      setSaveStatus('saving')
      try {
        const { version: newVersion } = await api.updateContent(roomId, newText, currentVersionRef.current)
        setVersion(newVersion)
        setSaveStatus('saved')
        setTimeout(() => {
          setSaveStatus(prev => prev === 'saved' ? 'idle' : prev)
        }, 2000)
      } catch (err: any) {
        if (err.status === 409) {
          // Version conflict, poll immediately to get latest
          try {
            const data = await api.pollRoom(roomId)
            setTextState(data.content)
            setVersion(data.contentVersion)
            setSaveStatus('error')
            setTimeout(() => {
              setSaveStatus(prev => prev === 'error' ? 'idle' : prev)
            }, 2000)
          } catch (pollErr) {
            setSaveStatus('error')
          }
        } else {
          setSaveStatus('error')
        }
      }
    }, saveDelay)
  }, [roomId, saveDelay])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await api.pollRoom(roomId)
        if (data.contentVersion !== currentVersionRef.current && !isTypingRef.current) {
          setTextState(data.content)
          setVersion(data.contentVersion)
        }
      } catch (error) {
        console.error('Failed to poll room:', error)
      }
    }, pollInterval)

    return () => clearInterval(interval)
  }, [roomId, pollInterval])

  // Cleanup pending saves on unmount
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        clearTimeout(pendingSaveRef.current)
      }
    }
  }, [])

  return {
    text,
    setText,
    saveStatus,
    version
  }
}
