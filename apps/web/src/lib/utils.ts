import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDateTime(date: string | Date): string {
  return `${formatDate(date)} ${formatTime(date)}`
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const e = error as any
    return e?.response?.data?.message || e?.message || 'Something went wrong'
  }
  return 'Something went wrong'
}

export const SEVERITY_CONFIG = {
  CRITICAL: { label: 'Critical', color: 'bg-red-600 text-white', dot: 'bg-red-600', icon: '🚨' },
  HIGH:     { label: 'High',     color: 'bg-orange-500 text-white', dot: 'bg-orange-500', icon: '🔴' },
  MEDIUM:   { label: 'Medium',   color: 'bg-yellow-400 text-black', dot: 'bg-yellow-400', icon: '🟡' },
  LOW:      { label: 'Low',      color: 'bg-green-500 text-white', dot: 'bg-green-500', icon: '🟢' },
} as const

export const STATUS_CONFIG = {
  PENDING:            { label: 'Pending',            color: 'bg-gray-100 text-gray-600' },
  EVIDENCE_COLLECTED: { label: 'Evidence Collected', color: 'bg-blue-100 text-blue-600' },
  AI_VERIFYING:       { label: 'AI Verifying',       color: 'bg-purple-100 text-purple-600' },
  VERIFIED:           { label: 'Verified',           color: 'bg-orange-100 text-orange-600' },
  ACTIVE:             { label: 'Active',             color: 'bg-red-100 text-red-700' },
  RESOLVED:           { label: 'Resolved',           color: 'bg-green-100 text-green-700' },
  FALSE_ALARM:        { label: 'False Alarm',        color: 'bg-gray-100 text-gray-500' },
  CANCELLED:          { label: 'Cancelled',          color: 'bg-gray-100 text-gray-500' },
} as const

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
