/**
 * Central branding for the app. Change these to rebrand DB pages, sidebar, and metadata.
 */

export const BRANDING = {
  /** Product name (sidebar, panel headers, document title) */
  appName: "LinkedOut",
  /** Short tagline under the name (e.g. "Tribe Intelligence Platform") */
  tagline: "Tribe Intelligence Platform",
  /** Longer description for meta and setup (e.g. "AI-powered LinkedIn CRM for talent discovery...") */
  appDescription:
    "AI-powered LinkedIn CRM for talent discovery, tribe formation, and project management",
} as const

export const APP_NAME = BRANDING.appName
export const APP_TAGLINE = BRANDING.tagline
export const APP_DESCRIPTION = BRANDING.appDescription
