'use client'

import { cn } from '@/lib/shared/utils'
import * as React from 'react'

export interface ModelMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  role: 'user' | 'assistant' | 'system'
  content: string
  isLoading?: boolean
  model?: string
  timestamp?: Date
}

function ModelMessage({
  role,
  content,
  isLoading,
  model,
  timestamp,
  className,
  ...props
}: ModelMessageProps) {
  return (
    <div
      className={cn(
        'flex w-full gap-4 p-4',
        role === 'user' && 'justify-end',
        role === 'assistant' && 'justify-start',
        role === 'system' && 'justify-center',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          role === 'user' && 'bg-primary text-primary-foreground',
          role === 'assistant' && 'bg-muted text-muted-foreground',
          role === 'system' && 'bg-secondary text-secondary-foreground text-sm italic'
        )}
      >
        {model && role === 'assistant' && (
          <div className="mb-1 text-xs opacity-60">{model}</div>
        )}
        {isLoading ? (
          <div className="flex items-center gap-1">
            <span className="animate-pulse">●</span>
            <span className="animate-pulse delay-100">●</span>
            <span className="animate-pulse delay-200">●</span>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
        {timestamp && (
          <div className="mt-1 text-xs opacity-50">
            {timestamp.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  )
}

export { ModelMessage }
