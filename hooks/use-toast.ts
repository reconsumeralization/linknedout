'use client'

// Inspired by react-hot-toast library
import * as React from 'react'

import type { ToastActionElement, ToastProps } from '@/components/ui/toast'

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 5000

type ToastVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info'

// Override the variant type from ToastProps to support our extended variants
type ToasterToast = Omit<ToastProps, 'variant'> & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  variant?: ToastVariant
  duration?: number
  persistent?: boolean
}

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
  DISMISS_ALL: 'DISMISS_ALL',
  REMOVE_ALL: 'REMOVE_ALL',
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType['ADD_TOAST']
      toast: ToasterToast
    }
  | {
      type: ActionType['UPDATE_TOAST']
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType['DISMISS_TOAST']
      toastId?: ToasterToast['id']
    }
  | {
      type: ActionType['REMOVE_TOAST']
      toastId?: ToasterToast['id']
    }
  | {
      type: ActionType['DISMISS_ALL']
    }
  | {
      type: ActionType['REMOVE_ALL']
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string, delay: number = TOAST_REMOVE_DELAY) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: 'REMOVE_TOAST',
      toastId: toastId,
    })
  }, delay)

  toastTimeouts.set(toastId, timeout)
}

const clearToastTimeout = (toastId: string) => {
  const timeout = toastTimeouts.get(toastId)
  if (timeout) {
    clearTimeout(timeout)
    toastTimeouts.delete(toastId)
  }
}

const clearAllToastTimeouts = () => {
  toastTimeouts.forEach((timeout) => clearTimeout(timeout))
  toastTimeouts.clear()
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      }

    case 'DISMISS_TOAST': {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        const toast = state.toasts.find((t) => t.id === toastId)
        if (toast && !toast.persistent) {
          addToRemoveQueue(toastId, toast.duration || TOAST_REMOVE_DELAY)
        }
      } else {
        state.toasts.forEach((toast) => {
          if (!toast.persistent) {
            addToRemoveQueue(toast.id, toast.duration || TOAST_REMOVE_DELAY)
          }
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      }
    }

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      clearToastTimeout(action.toastId)
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }

    case 'DISMISS_ALL':
      state.toasts.forEach((toast) => {
        if (!toast.persistent) {
          addToRemoveQueue(toast.id, toast.duration || TOAST_REMOVE_DELAY)
        }
      })
      return {
        ...state,
        toasts: state.toasts.map((t) => ({
          ...t,
          open: false,
        })),
      }

    case 'REMOVE_ALL':
      clearAllToastTimeouts()
      return {
        ...state,
        toasts: [],
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, 'id'>

function toast({ duration, persistent, ...props }: Toast) {
  const id = genId()

  const update = (props: Partial<ToasterToast>) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    })

  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id })

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      duration,
      persistent,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  // Auto-dismiss after duration (unless persistent)
  if (!persistent && duration !== Infinity) {
    const dismissDelay = duration || TOAST_REMOVE_DELAY
    setTimeout(() => {
      dismiss()
    }, dismissDelay)
  }

  return {
    id,
    dismiss,
    update,
  }
}

// Convenience methods for different toast variants
toast.success = (props: Omit<Toast, 'variant'>) =>
  toast({ ...props, variant: 'success' })

toast.error = (props: Omit<Toast, 'variant'>) =>
  toast({ ...props, variant: 'destructive' })

toast.warning = (props: Omit<Toast, 'variant'>) =>
  toast({ ...props, variant: 'warning' })

toast.info = (props: Omit<Toast, 'variant'>) =>
  toast({ ...props, variant: 'info' })

toast.promise = async <T,>(
  promise: Promise<T>,
  {
    loading,
    success,
    error,
  }: {
    loading: Toast
    success: Toast | ((data: T) => Toast)
    error: Toast | ((err: unknown) => Toast)
  }
): Promise<T> => {
  const { id, update, dismiss } = toast({ ...loading, persistent: true })

  try {
    const result = await promise
    const successProps = typeof success === 'function' ? success(result) : success
    update({ ...successProps, persistent: false })
    setTimeout(dismiss, successProps.duration || TOAST_REMOVE_DELAY)
    return result
  } catch (err) {
    const errorProps = typeof error === 'function' ? error(err) : error
    update({ ...errorProps, variant: 'destructive', persistent: false })
    setTimeout(dismiss, errorProps.duration || TOAST_REMOVE_DELAY)
    throw err
  }
}

toast.dismiss = (toastId?: string) =>
  dispatch({ type: 'DISMISS_TOAST', toastId })

toast.dismissAll = () =>
  dispatch({ type: 'DISMISS_ALL' })

toast.removeAll = () =>
  dispatch({ type: 'REMOVE_ALL' })

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [])

  const dismissToast = React.useCallback((toastId?: string) => {
    dispatch({ type: 'DISMISS_TOAST', toastId })
  }, [])

  const dismissAll = React.useCallback(() => {
    dispatch({ type: 'DISMISS_ALL' })
  }, [])

  const removeAll = React.useCallback(() => {
    dispatch({ type: 'REMOVE_ALL' })
  }, [])

  return {
    ...state,
    toast,
    dismiss: dismissToast,
    dismissAll,
    removeAll,
    toastCount: state.toasts.length,
    hasToasts: state.toasts.length > 0,
  }
}

export { toast, useToast }
export type { Toast, ToasterToast, ToastVariant }

