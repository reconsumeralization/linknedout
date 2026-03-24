'use client'

import * as React from 'react'
import * as RechartsPrimitive from 'recharts'

import { cn } from '@/lib/shared/utils'

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: '', dark: '.dark' } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }

  return context
}

// Custom hook for responsive chart dimensions
function useChartDimensions(ref: React.RefObject<HTMLDivElement | null>) {
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })

  React.useEffect(() => {
    if (!ref.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width, height })
      }
    })

    resizeObserver.observe(ref.current)
    return () => resizeObserver.disconnect()
  }, [ref])

  return dimensions
}

// Utility function to format chart values
function formatChartValue(
  value: number,
  options?: {
    notation?: 'standard' | 'compact' | 'scientific' | 'engineering'
    maximumFractionDigits?: number
    prefix?: string
    suffix?: string
  }
): string {
  const { notation = 'standard', maximumFractionDigits = 2, prefix = '', suffix = '' } = options || {}
  
  const formatted = new Intl.NumberFormat('en-US', {
    notation,
    maximumFractionDigits,
  }).format(value)

  return `${prefix}${formatted}${suffix}`
}

// Utility function to generate accessible colors
function getAccessibleChartColors(count: number): string[] {
  const baseColors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
  ]

  if (count <= baseColors.length) {
    return baseColors.slice(0, count)
  }

  // Generate additional colors by rotating hue
  const additionalColors: string[] = []
  for (let i = baseColors.length; i < count; i++) {
    const hue = (i * 137.508) % 360 // Golden angle approximation for good distribution
    additionalColors.push(`hsl(${hue}, 70%, 50%)`)
  }

  return [...baseColors, ...additionalColors]
}

function ChartContainer({
  id,
  className,
  children,
  config,
  aspectRatio = 'video',
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  aspectRatio?: 'video' | 'square' | 'wide' | 'ultrawide' | number
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >['children']
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`
  const containerRef = React.useRef<HTMLDivElement>(null)
  const dimensions = useChartDimensions(containerRef)

  const aspectRatioClass = React.useMemo(() => {
    if (typeof aspectRatio === 'number') {
      return undefined
    }
    const ratioMap = {
      video: 'aspect-video',
      square: 'aspect-square',
      wide: 'aspect-[2/1]',
      ultrawide: 'aspect-[3/1]',
    }
    return ratioMap[aspectRatio]
  }, [aspectRatio])

  const aspectRatioStyle = React.useMemo(() => {
    if (typeof aspectRatio === 'number') {
      return { aspectRatio: String(aspectRatio) }
    }
    return undefined
  }, [aspectRatio])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={containerRef}
        data-slot="chart"
        data-chart={chartId}
        data-width={dimensions.width}
        data-height={dimensions.height}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          "[&_.recharts-cartesian-axis-tick_text]:text-[11px] [&_.recharts-cartesian-axis-tick_text]:font-medium",
          "[&_.recharts-legend-wrapper]:!static",
          aspectRatioClass,
          className,
        )}
        style={aspectRatioStyle}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color,
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join('\n')}
}
`,
          )
          .join('\n'),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
  showTotal = false,
  totalLabel = 'Total',
  valueFormatter,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<'div'> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: 'line' | 'dot' | 'dashed'
    nameKey?: string
    labelKey?: string
    showTotal?: boolean
    totalLabel?: string
    valueFormatter?: (value: number) => string
  }) {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey || item?.dataKey || item?.name || 'value'}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !labelKey && typeof label === 'string'
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label

    if (labelFormatter) {
      return (
        <div className={cn('font-medium', labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      )
    }

    if (!value) {
      return null
    }

    return <div className={cn('font-medium', labelClassName)}>{value}</div>
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ])

  const total = React.useMemo(() => {
    if (!showTotal || !payload?.length) return null
    return payload.reduce((sum, item) => {
      const value = typeof item.value === 'number' ? item.value : 0
      return sum + value
    }, 0)
  }, [showTotal, payload])

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== 'dot'
  const formatValue = valueFormatter || ((v: number) => v.toLocaleString())

  return (
    <div
      className={cn(
        'border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || 'value'}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)
          const indicatorColor = color || item.payload.fill || item.color

          return (
            <div
              key={item.dataKey}
              className={cn(
                '[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5',
                indicator === 'dot' && 'items-center',
              )}
            >
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn(
                          'shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)',
                          {
                            'h-2.5 w-2.5': indicator === 'dot',
                            'w-1': indicator === 'line',
                            'w-0 border-[1.5px] border-dashed bg-transparent':
                              indicator === 'dashed',
                            'my-0.5': nestLabel && indicator === 'dashed',
                          },
                        )}
                        style={
                          {
                            '--color-bg': indicatorColor,
                            '--color-border': indicatorColor,
                          } as React.CSSProperties
                        }
                      />
                    )
                  )}
                  <div
                    className={cn(
                      'flex flex-1 justify-between leading-none',
                      nestLabel ? 'items-end' : 'items-center',
                    )}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? tooltipLabel : null}
                      <span className="text-muted-foreground">
                        {itemConfig?.label || item.name}
                      </span>
                    </div>
                    {item.value !== undefined && item.value !== null && (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {formatValue(typeof item.value === 'number' ? item.value : 0)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
        {showTotal && total !== null && payload.length > 1 && (
          <div className="flex items-center justify-between border-t border-border/50 pt-1.5 mt-1">
            <span className="text-muted-foreground font-medium">{totalLabel}</span>
            <span className="text-foreground font-mono font-semibold tabular-nums">
              {formatValue(total)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = 'bottom',
  nameKey,
  layout = 'horizontal',
  onItemClick,
  interactive = false,
}: React.ComponentProps<'div'> &
  Pick<RechartsPrimitive.LegendProps, 'payload' | 'verticalAlign'> & {
    hideIcon?: boolean
    nameKey?: string
    layout?: 'horizontal' | 'vertical'
    onItemClick?: (dataKey: string) => void
    interactive?: boolean
  }) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-4',
        verticalAlign === 'top' ? 'pb-3' : 'pt-3',
        layout === 'vertical' && 'flex-col items-start gap-2',
        className,
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || 'value'}`
        const itemConfig = getPayloadConfigFromPayload(config, item, key)

        return (
          <div
            key={item.value}
            className={cn(
              '[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3',
              interactive && 'cursor-pointer hover:opacity-80 transition-opacity',
            )}
            onClick={() => {
              if (interactive && onItemClick && item.dataKey) {
                onItemClick(String(item.dataKey))
              }
            }}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={(e) => {
              if (interactive && onItemClick && item.dataKey && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                onItemClick(String(item.dataKey))
              }
            }}
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: item.color,
                }}
              />
            )}
            <span className="text-muted-foreground text-xs">
              {itemConfig?.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Empty state component for charts with no data
function ChartEmptyState({
  title = 'No data available',
  description,
  icon: Icon,
  className,
}: {
  title?: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 p-8 text-center',
        className,
      )}
    >
      {Icon && <Icon className="h-10 w-10 text-muted-foreground/50" />}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground/70">{description}</p>
      )}
    </div>
  )
}

// Loading state component for charts
function ChartLoadingState({
  className,
}: {
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center p-8',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary" />
        <p className="text-xs text-muted-foreground">Loading chart...</p>
      </div>
    </div>
  )
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }

  const payloadPayload =
    'payload' in payload &&
    typeof payload.payload === 'object' &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === 'string'
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === 'string'
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer, ChartEmptyState, ChartLegend,
  ChartLegendContent, ChartLoadingState, ChartStyle, ChartTooltip,
  ChartTooltipContent, formatChartValue,
  getAccessibleChartColors, useChart,
  useChartDimensions
}

