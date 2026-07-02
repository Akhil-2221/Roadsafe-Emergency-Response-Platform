'use client'
import { useState, useEffect, useCallback } from 'react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

// Global state
let globalToasts: Toast[] = []
let listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach(fn => fn())
}

export function toast(type: ToastType, message: string) {
  const id = Math.random().toString(36).slice(2)
  globalToasts = [...globalToasts, { id, type, message }]
  notifyListeners()
  setTimeout(() => {
    globalToasts = globalToasts.filter(t => t.id !== id)
    notifyListeners()
  }, 4500)
}

export const showToast = {
  success: (msg: string) => toast('success', msg),
  error: (msg: string) => toast('error', msg),
  warning: (msg: string) => toast('warning', msg),
  info: (msg: string) => toast('info', msg),
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const update = () => setToasts([...globalToasts])
    listeners.add(update)
    update()
    return () => { listeners.delete(update) }
  }, [])

  return { toasts, toast: showToast }
}

// Toast display component
const STYLES: Record<ToastType, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-yellow-500 text-gray-900',
  info: 'bg-blue-600 text-white',
}
const ICONS: Record<ToastType, string> = {
  success: '✓', error: '✕', warning: '⚠', info: 'ℹ',
}

export function ToastContainer() {
  const { toasts } = useToast()
  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium pointer-events-auto ${STYLES[t.type]}`}
          style={{ animation: 'slideUp 0.2s ease-out' }}
        >
          <span className="font-black text-base mt-0.5 flex-shrink-0">{ICONS[t.type]}</span>
          <span className="leading-relaxed">{t.message}</span>
        </div>
      ))}
      <style>{`@keyframes slideUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  )
}
