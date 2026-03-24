'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { cva, type VariantProps } from 'class-variance-authority'
import { CheckIcon, MinusIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/shared/utils'

const checkboxVariants = cva(
  'peer shrink-0 rounded-[4px] border shadow-xs outline-none transition-all duration-150 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        accent:
          'border-input dark:bg-input/30 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground dark:data-[state=checked]:bg-accent data-[state=checked]:border-accent focus-visible:border-accent focus-visible:ring-accent/50',
        destructive:
          'border-input dark:bg-input/30 data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground dark:data-[state=checked]:bg-destructive data-[state=checked]:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50',
      },
      size: {
        sm: 'size-3.5',
        default: 'size-4',
        lg: 'size-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

const indicatorSizeMap = {
  sm: 'size-2.5',
  default: 'size-3.5',
  lg: 'size-4',
}

interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {
  indeterminate?: boolean
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, variant, size, indeterminate, ...props }, ref) => {
  const iconSize = indicatorSizeMap[size ?? 'default']

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      data-indeterminate={indeterminate ? 'true' : undefined}
      className={cn(checkboxVariants({ variant, size }), className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
        forceMount={indeterminate ? true : undefined}
      >
        {indeterminate ? (
          <MinusIcon className={cn(iconSize, 'animate-in zoom-in-50 duration-150')} />
        ) : (
          <CheckIcon className={cn(iconSize, 'animate-in zoom-in-50 duration-150')} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox, checkboxVariants }
