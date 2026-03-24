import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ============================================================================
// Class Name Utilities
// ============================================================================

/**
 * Merges class names using clsx and tailwind-merge.
 * Handles conditional classes, arrays, and objects while
 * intelligently resolving Tailwind CSS class conflicts.
 *
 * @param inputs - Class values to merge (strings, arrays, objects, etc.)
 * @returns Merged and deduplicated class string
 *
 * @example
 * cn('px-2 py-1', 'px-4') // => 'py-1 px-4'
 * cn('text-red-500', condition && 'text-blue-500')
 * cn({ 'bg-white': isLight, 'bg-black': isDark })
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ============================================================================
// Date & Time Utilities
// ============================================================================

/**
 * Formats a date to a human-readable string.
 *
 * @param date - Date to format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }
): string {
  const dateObj = date instanceof Date ? date : new Date(date)
  if (isNaN(dateObj.getTime())) {
    return 'Invalid date'
  }
  return new Intl.DateTimeFormat('en-US', options).format(dateObj)
}

/**
 * Formats a date as a relative time string (e.g., "2 hours ago", "in 3 days").
 *
 * @param date - Date to format
 * @param baseDate - Base date for comparison (default: now)
 * @returns Relative time string
 */
export function formatRelativeTime(
  date: Date | string | number,
  baseDate: Date = new Date()
): string {
  const targetDate = date instanceof Date ? date : new Date(date)
  if (isNaN(targetDate.getTime())) {
    return 'Invalid date'
  }
  
  const diffMs = targetDate.getTime() - baseDate.getTime()
  const diffSecs = Math.round(diffMs / 1000)
  const diffMins = Math.round(diffSecs / 60)
  const diffHours = Math.round(diffMins / 60)
  const diffDays = Math.round(diffHours / 24)

  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

  if (Math.abs(diffSecs) < 60) {
    return rtf.format(diffSecs, 'second')
  } else if (Math.abs(diffMins) < 60) {
    return rtf.format(diffMins, 'minute')
  } else if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour')
  } else if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day')
  } else if (Math.abs(diffDays) < 365) {
    return rtf.format(Math.round(diffDays / 30), 'month')
  } else {
    return rtf.format(Math.round(diffDays / 365), 'year')
  }
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @param options - Formatting options
 * @returns Formatted duration string (e.g., "2h 30m", "45s")
 */
export function formatDuration(
  ms: number,
  options: { verbose?: boolean; maxUnits?: number } = {}
): string {
  const { verbose = false, maxUnits = 2 } = options
  
  if (ms < 0) ms = Math.abs(ms)
  if (ms < 1000) return verbose ? `${ms} milliseconds` : `${ms}ms`

  const units = [
    { label: verbose ? ' day' : 'd', ms: 86400000 },
    { label: verbose ? ' hour' : 'h', ms: 3600000 },
    { label: verbose ? ' minute' : 'm', ms: 60000 },
    { label: verbose ? ' second' : 's', ms: 1000 },
  ]

  const parts: string[] = []
  let remaining = ms

  for (const unit of units) {
    if (parts.length >= maxUnits) break
    const value = Math.floor(remaining / unit.ms)
    if (value > 0) {
      const suffix = verbose && value !== 1 ? 's' : ''
      parts.push(`${value}${unit.label}${suffix}`)
      remaining %= unit.ms
    }
  }

  return parts.join(' ') || (verbose ? '0 seconds' : '0s')
}

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * Delays execution for a specified duration.
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retries an async function with exponential backoff.
 *
 * @param fn - Async function to retry
 * @param options - Retry options
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    baseDelay?: number
    maxDelay?: number
    onRetry?: (error: unknown, attempt: number) => void
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 30000, onRetry } = options
  
  let lastError: unknown
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts) break
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
      onRetry?.(error, attempt)
      await sleep(delay)
    }
  }
  
  throw lastError
}

/**
 * Creates a timeout wrapper for a promise.
 *
 * @param promise - Promise to wrap
 * @param ms - Timeout in milliseconds
 * @param message - Optional timeout error message
 * @returns Promise that rejects on timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ])
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Capitalizes the first letter of a string.
 *
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Converts a string to title case.
 *
 * @param str - String to convert
 * @returns Title-cased string
 */
export function toTitleCase(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Converts a string to kebab-case.
 *
 * @param str - String to convert
 * @returns Kebab-cased string
 */
export function toKebabCase(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/**
 * Converts a string to camelCase.
 *
 * @param str - String to convert
 * @returns Camel-cased string
 */
export function toCamelCase(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
}

/**
 * Converts a string to snake_case.
 *
 * @param str - String to convert
 * @returns Snake-cased string
 */
export function toSnakeCase(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

/**
 * Converts a string to PascalCase.
 *
 * @param str - String to convert
 * @returns Pascal-cased string
 */
export function toPascalCase(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .toLowerCase()
    .replace(/(^|[^a-zA-Z0-9]+)(.)/g, (_, __, chr) => chr.toUpperCase())
}

/**
 * Truncates a string to a specified length with ellipsis.
 *
 * @param str - String to truncate
 * @param length - Maximum length before truncation
 * @param suffix - Suffix to append (default: '...')
 * @returns Truncated string
 */
export function truncate(str: string, length: number, suffix: string = '...'): string {
  if (!str || str.length <= length) return str || ''
  return str.slice(0, length - suffix.length).trim() + suffix
}

/**
 * Truncates a string in the middle, preserving start and end.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum total length
 * @param separator - Separator in the middle (default: '...')
 * @returns Truncated string
 */
export function truncateMiddle(
  str: string,
  maxLength: number,
  separator: string = '...'
): string {
  if (!str || str.length <= maxLength) return str || ''
  const charsToShow = maxLength - separator.length
  const frontChars = Math.ceil(charsToShow / 2)
  const backChars = Math.floor(charsToShow / 2)
  return str.slice(0, frontChars) + separator + str.slice(-backChars)
}

/**
 * Pluralizes a word based on count.
 *
 * @param count - The count to check
 * @param singular - Singular form of the word
 * @param plural - Plural form (default: singular + 's')
 * @returns Pluralized string with count
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${count} ${word}`
}

/**
 * Slugifies a string for use in URLs.
 *
 * @param str - String to slugify
 * @returns URL-safe slug
 */
export function slugify(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ============================================================================
// ID Generation Utilities
// ============================================================================

/**
 * Generates a random string ID.
 *
 * @param length - Length of the ID (default: 8)
 * @returns Random alphanumeric string
 */
export function generateId(length: number = 8): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length)
}

/**
 * Generates a cryptographically secure random string.
 *
 * @param length - Length of the string (default: 16)
 * @returns Secure random string
 */
export function generateSecureId(length: number = 16): string {
  const array = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

/**
 * Generates a UUID v4.
 *
 * @returns UUID string
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ============================================================================
// Function Utilities
// ============================================================================

/**
 * Debounces a function call.
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
  
  debounced.cancel = () => {
    clearTimeout(timeoutId)
    timeoutId = undefined
  }
  
  return debounced
}

/**
 * Throttles a function call.
 *
 * @param fn - Function to throttle
 * @param limit - Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  let lastArgs: Parameters<T> | null = null
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
        if (lastArgs) {
          fn(...lastArgs)
          lastArgs = null
        }
      }, limit)
    } else {
      lastArgs = args
    }
  }
}

/**
 * Memoizes a function's results.
 *
 * @param fn - Function to memoize
 * @param keyFn - Optional function to generate cache key
 * @returns Memoized function with cache control
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  keyFn: (...args: Parameters<T>) => string = (...args) => JSON.stringify(args)
): T & { cache: Map<string, ReturnType<T>>; clear: () => void } {
  const cache = new Map<string, ReturnType<T>>()
  
  const memoized = ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyFn(...args)
    if (cache.has(key)) {
      return cache.get(key)!
    }
    const result = fn(...args) as ReturnType<T>
    cache.set(key, result)
    return result
  }) as T & { cache: Map<string, ReturnType<T>>; clear: () => void }
  
  memoized.cache = cache
  memoized.clear = () => cache.clear()
  
  return memoized
}

/**
 * Calls a function only once, returning cached result thereafter.
 *
 * @param fn - Function to call once
 * @returns Function that returns cached result
 */
export function once<T extends (...args: unknown[]) => unknown>(
  fn: T
): (...args: Parameters<T>) => ReturnType<T> {
  let called = false
  let result: ReturnType<T>
  
  return (...args: Parameters<T>): ReturnType<T> => {
    if (!called) {
      called = true
      result = fn(...args) as ReturnType<T>
    }
    return result
  }
}

// ============================================================================
// Type Guard Utilities
// ============================================================================

/**
 * Checks if a value is defined (not null or undefined).
 *
 * @param value - Value to check
 * @returns Type guard for defined values
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/**
 * Checks if a value is a non-empty string.
 *
 * @param value - Value to check
 * @returns Type guard for non-empty strings
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Checks if a value is a plain object.
 *
 * @param value - Value to check
 * @returns Type guard for plain objects
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

/**
 * Checks if a value is a valid number (not NaN or Infinity).
 *
 * @param value - Value to check
 * @returns Type guard for valid numbers
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Checks if a value is a valid date.
 *
 * @param value - Value to check
 * @returns Type guard for valid dates
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime())
}

// ============================================================================
// Number Formatting Utilities
// ============================================================================

/**
 * Formats a number as currency.
 *
 * @param amount - Amount to format
 * @param currency - Currency code (default: 'USD')
 * @param locale - Locale string (default: 'en-US')
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Formats a number with compact notation (e.g., 1K, 1M, 1B).
 *
 * @param num - Number to format
 * @param locale - Locale string (default: 'en-US')
 * @returns Compact formatted number string
 */
export function formatCompactNumber(num: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(num)
}

/**
 * Formats a number with thousand separators.
 *
 * @param num - Number to format
 * @param locale - Locale string (default: 'en-US')
 * @returns Formatted number string
 */
export function formatNumber(num: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(num)
}

/**
 * Formats a number as a percentage.
 *
 * @param value - Value to format (0-1 or 0-100 depending on isDecimal)
 * @param decimals - Number of decimal places (default: 0)
 * @param isDecimal - Whether input is decimal (0-1) or percentage (0-100)
 * @returns Formatted percentage string
 */
export function formatPercent(
  value: number,
  decimals: number = 0,
  isDecimal: boolean = true
): string {
  const percentage = isDecimal ? value * 100 : value
  return `${percentage.toFixed(decimals)}%`
}

/**
 * Formats bytes to a human-readable string.
 *
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'
  if (bytes < 0) bytes = Math.abs(bytes)

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const index = Math.min(i, sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, index)).toFixed(dm)) + ' ' + sizes[index]
}

// ============================================================================
// Math Utilities
// ============================================================================

/**
 * Clamps a number between a minimum and maximum value.
 *
 * @param num - Number to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped number
 */
export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max)
}

/**
 * Rounds a number to a specified number of decimal places.
 *
 * @param num - Number to round
 * @param decimals - Number of decimal places (default: 0)
 * @returns Rounded number
 */
export function roundTo(num: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals)
  return Math.round(num * factor) / factor
}

/**
 * Calculates the average of an array of numbers.
 *
 * @param numbers - Array of numbers
 * @returns Average value, or 0 for empty array
 */
export function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}

/**
 * Calculates the sum of an array of numbers.
 *
 * @param numbers - Array of numbers
 * @returns Sum of all numbers
 */
export function sum(numbers: number[]): number {
  return numbers.reduce((total, n) => total + n, 0)
}

/**
 * Generates a random integer between min and max (inclusive).
 *
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random integer
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Groups an array of objects by a key.
 *
 * @param array - Array to group
 * @param key - Key to group by (or function returning key)
 * @returns Grouped object
 */
export function groupBy<T>(
  array: T[],
  key: keyof T | ((item: T) => string)
): Record<string, T[]> {
  return array.reduce(
    (result, item) => {
      const groupKey = typeof key === 'function' ? key(item) : String(item[key])
      if (!result[groupKey]) {
        result[groupKey] = []
      }
      result[groupKey].push(item)
      return result
    },
    {} as Record<string, T[]>
  )
}

/**
 * Removes duplicate values from an array.
 *
 * @param array - Array with potential duplicates
 * @param key - Optional key for object comparison
 * @returns Array with unique values
 */
export function uniqueBy<T>(array: T[], key?: keyof T | ((item: T) => unknown)): T[] {
  if (!key) {
    return [...new Set(array)]
  }
  const seen = new Set()
  return array.filter((item) => {
    const k = typeof key === 'function' ? key(item) : item[key]
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Chunks an array into smaller arrays of a specified size.
 *
 * @param array - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) return []
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

/**
 * Flattens a nested array to a specified depth.
 *
 * @param array - Nested array to flatten
 * @param depth - Maximum depth to flatten (default: 1)
 * @returns Flattened array
 */
export function flatten<T>(array: (T | T[])[], depth: number = 1): T[] {
  return array.flat(depth) as T[]
}

/**
 * Shuffles an array using Fisher-Yates algorithm.
 *
 * @param array - Array to shuffle
 * @returns New shuffled array
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Returns the first n elements of an array.
 *
 * @param array - Source array
 * @param n - Number of elements to take
 * @returns First n elements
 */
export function take<T>(array: T[], n: number): T[] {
  return array.slice(0, n)
}

/**
 * Returns the last n elements of an array.
 *
 * @param array - Source array
 * @param n - Number of elements to take
 * @returns Last n elements
 */
export function takeLast<T>(array: T[], n: number): T[] {
  return array.slice(-n)
}

// ============================================================================
// Object Utilities
// ============================================================================

/**
 * Safely parses JSON with a fallback value.
 *
 * @param json - JSON string to parse
 * @param fallback - Fallback value on parse error
 * @returns Parsed object or fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/**
 * Creates a range of numbers.
 *
 * @param start - Start of the range
 * @param end - End of the range (exclusive)
 * @param step - Step between values (default: 1)
 * @returns Array of numbers
 */
export function range(start: number, end: number, step: number = 1): number[] {
  if (step === 0) return []
  const result: number[] = []
  if (step > 0) {
    for (let i = start; i < end; i += step) {
      result.push(i)
    }
  } else {
    for (let i = start; i > end; i += step) {
      result.push(i)
    }
  }
  return result
}

/**
 * Picks specified keys from an object.
 *
 * @param obj - Source object
 * @param keys - Keys to pick
 * @returns New object with only picked keys
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  return keys.reduce(
    (result, key) => {
      if (key in obj) {
        result[key] = obj[key]
      }
      return result
    },
    {} as Pick<T, K>
  )
}

/**
 * Omits specified keys from an object.
 *
 * @param obj - Source object
 * @param keys - Keys to omit
 * @returns New object without omitted keys
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj }
  for (const key of keys) {
    delete result[key]
  }
  return result as Omit<T, K>
}

/**
 * Deep clones an object.
 *
 * @param obj - Object to clone
 * @returns Deep cloned object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as T
  if (Array.isArray(obj)) return obj.map(deepClone) as T
  
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, deepClone(v)])
  ) as T
}

/**
 * Deep merges objects together.
 *
 * @param target - Target object
 * @param sources - Source objects to merge
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = { ...target }
  
  for (const source of sources) {
    for (const key of Object.keys(source) as (keyof T)[]) {
      const sourceValue = source[key]
      const targetValue = result[key]
      
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[keyof T]
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue as T[keyof T]
      }
    }
  }
  
  return result
}

/**
 * Checks if two values are deeply equal.
 *
 * @param a - First value
 * @param b - Second value
 * @returns True if deeply equal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) => deepEqual(a[key], b[key]))
  }
  
  return false
}