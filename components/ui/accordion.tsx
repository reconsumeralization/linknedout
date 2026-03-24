'use client'

import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { cva } from 'class-variance-authority'
import { ChevronDownIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/shared/utils'

const accordionVariants = cva('', {
  variants: {
    variant: {
      default: '',
      bordered: 'border rounded-lg',
      separated: 'space-y-2',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

const accordionItemVariants = cva('', {
  variants: {
    variant: {
      default: 'border-b last:border-b-0',
      bordered: 'border-b last:border-b-0',
      separated: 'border rounded-lg',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

const accordionTriggerVariants = cva(
  'focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
  {
    variants: {
      size: {
        sm: 'py-2 text-xs',
        default: 'py-4 text-sm',
        lg: 'py-5 text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

const accordionContentVariants = cva(
  'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden',
  {
    variants: {
      size: {
        sm: 'text-xs',
        default: 'text-sm',
        lg: 'text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

const contentPaddingMap = {
  sm: 'pt-0 pb-2',
  default: 'pt-0 pb-4',
  lg: 'pt-0 pb-5',
} as const

const iconSizeMap = {
  sm: 'size-3',
  default: 'size-4',
  lg: 'size-5',
} as const

type AccordionContextValue = {
  variant?: 'default' | 'bordered' | 'separated'
  size?: 'sm' | 'default' | 'lg'
}

const AccordionContext = React.createContext<AccordionContextValue>({})

function useAccordionContext() {
  return React.useContext(AccordionContext)
}

type AccordionProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root> & {
  variant?: 'default' | 'bordered' | 'separated'
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

/**
 * Accordion component - a presentational UI component
 * 
 * Security Note: This is a Client Component that only handles UI state.
 * - Does not accept sensitive data as props
 * - Content should be sanitized before being passed as children
 * - All data fetching should occur in Server Components or DAL
 */
function Accordion({
  className,
  variant,
  size,
  ...props
}: AccordionProps) {
  return (
    <AccordionContext.Provider value={{ variant: variant ?? 'default', size: size ?? 'default' }}>
      <AccordionPrimitive.Root
        data-slot="accordion"
        className={cn(accordionVariants({ variant }), className)}
        {...props}
      />
    </AccordionContext.Provider>
  )
}

type AccordionItemProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> & {
  variant?: 'default' | 'bordered' | 'separated'
  className?: string
}

function AccordionItem({
  className,
  variant: variantProp,
  ...props
}: AccordionItemProps) {
  const { variant: contextVariant } = useAccordionContext()
  const variant = variantProp ?? contextVariant

  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(accordionItemVariants({ variant }), className)}
      {...props}
    />
  )
}

type AccordionTriggerProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
  size?: 'sm' | 'default' | 'lg'
  className?: string
  hideIcon?: boolean
}

function AccordionTrigger({
  className,
  children,
  size: sizeProp,
  hideIcon = false,
  ...props
}: AccordionTriggerProps) {
  const { size: contextSize } = useAccordionContext()
  const size = sizeProp ?? contextSize ?? 'default'
  const iconSize = iconSizeMap[size]

  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(accordionTriggerVariants({ size }), className)}
        {...props}
      >
        {children}
        {!hideIcon && (
          <ChevronDownIcon
            className={cn(
              'text-muted-foreground pointer-events-none shrink-0 translate-y-0.5 transition-transform duration-200',
              iconSize
            )}
          />
        )}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

type AccordionContentProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> & {
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

/**
 * AccordionContent - renders accordion panel content
 * 
 * Security Note: Content is rendered using React's default escaping.
 * - Never use dangerouslySetInnerHTML within accordion content
 * - If dynamic HTML is required, sanitize with DOMPurify in a Server Component first
 */
function AccordionContent({
  className,
  children,
  size: sizeProp,
  ...props
}: AccordionContentProps) {
  const { size: contextSize } = useAccordionContext()
  const size = sizeProp ?? contextSize ?? 'default'
  const contentPadding = contentPaddingMap[size]

  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className={cn(accordionContentVariants({ size }))}
      {...props}
    >
      <div className={cn(contentPadding, className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
export type { AccordionContentProps, AccordionItemProps, AccordionProps, AccordionTriggerProps }

