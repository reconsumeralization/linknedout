'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/shared/utils'
import { AlertCircle, Brain, CheckCircle2, Lightbulb, TrendingUp, Zap } from 'lucide-react'
import * as React from 'react'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type IntelligenceEventType =
  | 'insight'
  | 'recommendation'
  | 'trend'
  | 'alert'
  | 'success'
  | 'action'

export interface IntelligenceEvent {
  id: string
  type: IntelligenceEventType
  title: string
  description: string
  timestamp: Date
  confidence?: number
  source?: string
  metadata?: Record<string, unknown>
}

export interface IntelligenceStreamProps extends React.HTMLAttributes<HTMLDivElement> {
  events?: IntelligenceEvent[]
  maxEvents?: number
  isLive?: boolean
  onEventClick?: (event: IntelligenceEvent) => void
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getEventIcon(type: IntelligenceEventType) {
  switch (type) {
    case 'insight':
      return Brain
    case 'recommendation':
      return Lightbulb
    case 'trend':
      return TrendingUp
    case 'alert':
      return AlertCircle
    case 'success':
      return CheckCircle2
    case 'action':
      return Zap
    default:
      return Brain
  }
}

function getEventColor(type: IntelligenceEventType) {
  switch (type) {
    case 'insight':
      return 'text-purple-500 bg-purple-500/10'
    case 'recommendation':
      return 'text-yellow-500 bg-yellow-500/10'
    case 'trend':
      return 'text-blue-500 bg-blue-500/10'
    case 'alert':
      return 'text-red-500 bg-red-500/10'
    case 'success':
      return 'text-green-500 bg-green-500/10'
    case 'action':
      return 'text-orange-500 bg-orange-500/10'
    default:
      return 'text-muted-foreground bg-muted'
  }
}

function formatTimestamp(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  return date.toLocaleDateString()
}

// =============================================================================
// EVENT ITEM COMPONENT
// =============================================================================

interface IntelligenceStreamEventItemProps {
  event: IntelligenceEvent
  onClick?: () => void
}

function IntelligenceStreamEventItem({ event, onClick }: IntelligenceStreamEventItemProps) {
  const Icon = getEventIcon(event.type)
  const colorClass = getEventColor(event.type)

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-colors',
        'hover:bg-muted/50',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className={cn('p-2 rounded-full shrink-0', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{event.title}</p>
          {event.confidence !== undefined && (
            <Badge variant="outline" className="shrink-0 text-xs">
              {Math.round(event.confidence * 100)}%
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {event.description}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(event.timestamp)}
          </span>
          {event.source && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{event.source}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function IntelligenceStream({
  events = [],
  maxEvents = 50,
  isLive = true,
  onEventClick,
  className,
  ...props
}: IntelligenceStreamProps) {
  const displayedEvents = events.slice(0, maxEvents)

  return (
    <Card className={cn('flex flex-col h-full', className)} {...props}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Intelligence Stream
          </CardTitle>
          {isLive && (
            <Badge variant="secondary" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full px-4 pb-4">
          {displayedEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Brain className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No intelligence yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayedEvents.map((event) => (
                <IntelligenceStreamEventItem
                  key={event.id}
                  event={event}
                  onClick={onEventClick ? () => onEventClick(event) : undefined}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export { IntelligenceStream, IntelligenceStreamEventItem }
