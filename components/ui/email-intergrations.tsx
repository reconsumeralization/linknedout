'use client'

import { Check, Mail, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/shared/utils'

export interface EmailIntegration {
  id: string
  email: string
  provider: 'gmail' | 'outlook' | 'imap' | 'other'
  status: 'connected' | 'disconnected' | 'error' | 'syncing'
  lastSync?: Date
  autoSync: boolean
}

export interface EmailIntegrationsProps extends React.HTMLAttributes<HTMLDivElement> {
  integrations?: EmailIntegration[]
  onAdd?: (email: string, provider: EmailIntegration['provider']) => void
  onRemove?: (id: string) => void
  onToggleSync?: (id: string, enabled: boolean) => void
  onRefresh?: (id: string) => void
}

function getProviderIcon(provider: EmailIntegration['provider']) {
  switch (provider) {
    case 'gmail':
      return '📧'
    case 'outlook':
      return '📬'
    case 'imap':
      return '📨'
    default:
      return '✉️'
  }
}

function getStatusBadge(status: EmailIntegration['status']) {
  switch (status) {
    case 'connected':
      return <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-600"><Check className="h-3 w-3" />Connected</Badge>
    case 'disconnected':
      return <Badge variant="secondary" className="gap-1 bg-gray-500/10 text-gray-600"><X className="h-3 w-3" />Disconnected</Badge>
    case 'error':
      return <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" />Error</Badge>
    case 'syncing':
      return <Badge variant="secondary" className="gap-1 bg-blue-500/10 text-blue-600"><RefreshCw className="h-3 w-3 animate-spin" />Syncing</Badge>
    default:
      return <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground">{String(status)}</Badge>
  }
}

function EmailIntegrationItem({
  integration,
  onRemove,
  onToggleSync,
  onRefresh,
}: {
  integration: EmailIntegration
  onRemove?: (id: string) => void
  onToggleSync?: (id: string, enabled: boolean) => void
  onRefresh?: (id: string) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <span className="text-xl">{getProviderIcon(integration.provider)}</span>
        <div className="flex flex-col">
          <span className="font-medium text-sm">{integration.email}</span>
          <div className="flex items-center gap-2 mt-1">
            {getStatusBadge(integration.status)}
            {integration.lastSync && (
              <span className="text-xs text-muted-foreground">
                Last sync: {integration.lastSync.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={`sync-${integration.id}`} className="text-xs text-muted-foreground">
            Auto-sync
          </Label>
          <Switch
            id={`sync-${integration.id}`}
            checked={integration.autoSync}
            onCheckedChange={(checked) => onToggleSync?.(integration.id, checked)}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRefresh?.(integration.id)}
          disabled={integration.status === 'syncing'}
        >
          <RefreshCw className={cn("h-4 w-4", integration.status === 'syncing' && "animate-spin")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove?.(integration.id)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

function EmailIntegrations({
  integrations = [],
  onAdd,
  onRemove,
  onToggleSync,
  onRefresh,
  className,
  ...props
}: EmailIntegrationsProps) {
  const [newEmail, setNewEmail] = React.useState('')
  const [selectedProvider, setSelectedProvider] = React.useState<EmailIntegration['provider']>('gmail')

  const handleAdd = () => {
    if (newEmail.trim()) {
      onAdd?.(newEmail.trim(), selectedProvider)
      setNewEmail('')
    }
  }

  return (
    <Card className={cn('flex flex-col h-full', className)} {...props}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Integrations
            </CardTitle>
            <CardDescription className="mt-1">
              Connect your email accounts to sync contacts and communications
            </CardDescription>
          </div>
          <Badge variant="outline">{integrations.length} connected</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter email address..."
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1"
          />
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value as EmailIntegration['provider'])}
            className="px-3 py-2 rounded-md border bg-background text-sm"
          >
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook</option>
            <option value="imap">IMAP</option>
            <option value="other">Other</option>
          </select>
          <Button onClick={handleAdd} disabled={!newEmail.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {integrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Mail className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No email integrations yet</p>
              <p className="text-xs">Add an email account to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {integrations.map((integration) => (
                <EmailIntegrationItem
                  key={integration.id}
                  integration={integration}
                  onRemove={onRemove}
                  onToggleSync={onToggleSync}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export { EmailIntegrationItem, EmailIntegrations }
