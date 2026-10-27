import React from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type StatusType =
  | 'enquiry'
  | 'enrolled'
  | 'active'
  | 'completed'
  | 'dropped'
  | 'accepted'
  | 'cancelled'
  | string

interface StatusConfig {
  label?: string
  className?: string
  dotClassName?: string
}

const defaultStatusMap: Record<string, StatusConfig> = {
  enquiry: {
    label: 'Enquiry',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
    dotClassName: 'bg-gray-400',
  },
  enrolled: {
    label: 'Enrolled',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClassName: 'bg-blue-500',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClassName: 'bg-emerald-500',
  },
  accepted: {
    label: 'Accepted',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClassName: 'bg-emerald-500',
  },
  completed: {
    label: 'Completed',
    className: 'bg-teal-50 text-teal-700 border-teal-200',
    dotClassName: 'bg-teal-500',
  },
  dropped: {
    label: 'Dropped',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClassName: 'bg-rose-500',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClassName: 'bg-rose-500',
  },
  canceled: {
    label: 'Cancelled',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClassName: 'bg-rose-500',
  },
}

interface StatusBadgeProps {
  status: StatusType
  customMap?: Record<string, StatusConfig>
  className?: string
  showDot?: boolean
}

export function StatusBadge({
  status,
  customMap,
  className,
  showDot = true,
}: StatusBadgeProps) {
  const normalizedKey = status?.toLowerCase() || ''
  const config =
    customMap?.[normalizedKey] ||
    defaultStatusMap[normalizedKey] || {
      label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown',
      className: 'bg-gray-100 text-gray-700 border-gray-200',
      dotClassName: 'bg-gray-400',
    }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shadow-xs transition-colors',
        config.className,
        className
      )}
    >
      {showDot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', config.dotClassName)}
          aria-hidden="true"
        />
      )}
      {config.label || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown')}
    </span>
  )
}
