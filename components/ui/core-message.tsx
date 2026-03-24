"use client"

import { cn } from "@/lib/shared/utils"
import * as React from "react"

export interface CoreMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  role: "user" | "assistant" | "system"
  content: string
  isLoading?: boolean
}

function CoreMessage({
  role,
  content,
  isLoading,
  className,
  ...props
}: CoreMessageProps) {
  return (
    <div
      className={cn(
        "flex w-full gap-4 p-4",
        role === "user" && "justify-end",
        role === "assistant" && "justify-start",
        role === "system" && "justify-center",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2",
          role === "user" && "bg-primary text-primary-foreground",
          role === "assistant" && "bg-muted text-muted-foreground",
          role === "system" && "bg-secondary text-secondary-foreground text-sm italic"
        )}
      >
        {isLoading ? (
          <div className="flex items-center gap-1">
            <span className="animate-pulse">●</span>
            <span className="animate-pulse delay-100">●</span>
            <span className="animate-pulse delay-200">●</span>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  )
}

export { CoreMessage }
