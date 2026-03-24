export type SeedProjectType =
  | "hiring"
  | "team-building"
  | "aspiration"
  | "tribe"
  | "network-expansion"

export interface ProjectCreateSeed {
  suggestedName?: string
  suggestedType?: SeedProjectType
  suggestedDescription?: string
  suggestedDate?: string
}

export interface ProjectFocusSeed {
  projectId?: string
  fallbackName?: string
}

export const LINKEDOUT_CREATE_PROJECT_SEED_KEY = "linkedout_create_project"
export const LINKEDOUT_PROJECT_FOCUS_SEED_KEY = "linkedout_project_focus"
