"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"

interface PanelErrorBoundaryProps {
  children: ReactNode
  panelName?: string
  fallback?: ReactNode
}

interface PanelErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PanelErrorBoundary:${this.props.panelName ?? "unknown"}]`, error, info)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <CardTitle className="text-lg">
                {this.props.panelName ? `${this.props.panelName} encountered an error` : "Something went wrong"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              {process.env.NODE_ENV === "development" && this.state.error && (
                <p className="text-xs text-muted-foreground font-mono break-all">
                  {this.state.error.message}
                </p>
              )}
              <Button onClick={this.handleReset} variant="outline" size="sm">
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
