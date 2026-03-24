'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/shared/utils'
import { MessageSquare, TrendingUp, Users, Zap } from 'lucide-react'
import * as React from 'react'

export interface TribeStreamEvent {
  id: string
  type: 'message' | 'join' | 'activity' | 'milestone'
  tribeName: string
  tribeId: string
  content: string
  timestamp: Date
  user?: {
    name: string
    avatar?: string
  }
  metadata?: Record<string, unknown>
}

export interface TribeStreamProps extends React.HTMLAttributes<HTMLDivElement> {
  events?: TribeStreamEvent[]
  maxEvents?: number
  isLive?: boolean
  onEventClick?: (event: TribeStreamEvent) => void
}

const eventIcons = {
  message: MessageSquare,
  join: Users,
  activity: Zap,
  milestone: TrendingUp,
}

const eventColors = {
  message: 'bg-blue-500/10 text-blue-500',
  join: 'bg-green-500/10 text-green-500',
  activity: 'bg-yellow-500/10 text-yellow-500',
  milestone: 'bg-purple-500/10 text-purple-500',
}

function TribeStreamEventItem({
  event,
  onClick,
}: {
  event: TribeStreamEvent
  onClick?: () => void
}) {
  const Icon = eventIcons[event.type]
  const colorClass = eventColors[event.type]

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer hover:bg-muted/50',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className={cn('p-2 rounded-full', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {event.user && (
            <Avatar className="h-5 w-5">
              <AvatarImage src={event.user.avatar} alt={event.user.name} />
              <AvatarFallback className="text-xs">
                {event.user.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="text-sm font-medium truncate">
            {event.user?.name || 'System'}
          </span>
          <Badge variant="outline" className="text-xs">
            {event.tribeName}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {event.content}
        </p>
        <span className="text-xs text-muted-foreground/60 mt-1">
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>
    </div>
  )
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function TribeStream({
  events = [],
  maxEvents = 50,
  isLive = true,
  onEventClick,
  className,
  ...props
}: TribeStreamProps) {
  const displayedEvents = events.slice(0, maxEvents)

  return (
    <Card className={cn('flex flex-col h-full', className)} {...props}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Tribe Activity</CardTitle>
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
              <Users className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayedEvents.map((event) => (
                <TribeStreamEventItem
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

export { TribeStream, TribeStreamEventItem }
