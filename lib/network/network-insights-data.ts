/**
 * Industry categories for professional network insights
 */
export type InsightIndustry =
  | "Engineering"
  | "Data"
  | "Product"
  | "Design"
  | "Marketing"
  | "Operations"
  | "Finance"

/**
 * Geographic locations for network filtering
 */
export type InsightLocation =
  | "San Francisco"
  | "New York"
  | "Austin"
  | "Seattle"
  | "Chicago"
  | "Remote"

/**
 * Community classification for network clustering
 */
export type CommunityType = "Core" | "Growth" | "Ops" | "Creative"

/**
 * Category classification for tribes
 */
export type TribeCategory = "Tech" | "Business" | "Creative" | "Community"

/**
 * Category classification for groups
 */
export type GroupCategory = "Leadership" | "Functional" | "Industry" | "Local"

/**
 * Day of the week for heatmap data
 */
export type WeekDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"

/**
 * Time period for activity tracking
 */
export type DayPeriod = "Morning" | "Afternoon" | "Evening"

/**
 * Represents a node in the friend network graph
 */
export interface FriendNode {
  /** Unique identifier for the friend */
  id: string
  /** Display name of the friend */
  label: string
  /** Professional role/title */
  role: string
  /** Industry category */
  industry: InsightIndustry
  /** Geographic location */
  location: InsightLocation
  /** Number of mutual connections */
  mutualConnections: number
  /** Community cluster assignment */
  community: CommunityType
  /** Whether this friend is a recommended connection */
  recommended: boolean
  /** X coordinate for graph visualization (0-100) */
  x: number
  /** Y coordinate for graph visualization (0-100) */
  y: number
}

/**
 * Represents a connection between two friends in the network
 */
export interface FriendLink {
  /** ID of the source friend node */
  source: string
  /** ID of the target friend node */
  target: string
  /** Connection strength score (0-100) */
  strength: number
  /** Whether the connection is pending acceptance */
  pending?: boolean
}

/**
 * Data point for friend network growth over time
 */
export interface FriendGrowthPoint {
  /** Month label (e.g., "Jan", "Feb") */
  month: string
  /** Number of friends added during this month */
  friendsAdded: number
}

/**
 * Represents a tribe/community bubble in the visualization
 */
export interface TribeBubble {
  /** Unique identifier for the tribe */
  id: string
  /** Display name of the tribe */
  name: string
  /** Category classification */
  category: TribeCategory
  /** Number of members in the tribe */
  members: number
  /** Growth percentage over the tracking period */
  growthPct: number
  /** Activity score (0-100) */
  activityScore: number
  /** X coordinate for bubble visualization (0-100) */
  x: number
  /** Y coordinate for bubble visualization (0-100) */
  y: number
}

/**
 * Represents a group in the network
 */
export interface GroupNode {
  /** Unique identifier for the group */
  id: string
  /** Display name of the group */
  name: string
  /** Category classification */
  category: GroupCategory
  /** Number of members in the group */
  members: number
  /** Engagement score (0-100) */
  engagementScore: number
}

/**
 * Represents overlap between two groups
 */
export interface GroupOverlap {
  /** ID of the source group */
  source: string
  /** ID of the target group */
  target: string
  /** Number of members shared between groups */
  sharedMembers: number
  /** Names of top shared connections */
  topSharedFriends: string[]
}

/**
 * Activity metrics for a specific group
 */
export interface GroupActivityPoint {
  /** Group name/label */
  group: string
  /** Number of posts in the tracking period */
  posts: number
  /** Number of comments in the tracking period */
  comments: number
  /** Number of new joins in the tracking period */
  joins: number
}

/**
 * Heatmap cell for group activity by day and time period
 */
export interface GroupHeatCell {
  /** Day of the week */
  day: WeekDay
  /** Time period of the day */
  period: DayPeriod
  /** Activity score (0-100) */
  score: number
}

/**
 * Node in the job application funnel (Sankey diagram)
 */
export interface JobFunnelNode {
  /** Name/label of the funnel stage */
  name: string
}

/**
 * Link between stages in the job funnel
 */
export interface JobFunnelLink {
  /** Index of the source node */
  source: number
  /** Index of the target node */
  target: number
  /** Number of applications flowing through this link */
  value: number
}

/**
 * Data point for job scatter plot visualization
 */
export interface JobScatterPoint {
  /** Unique identifier for the job */
  id: string
  /** Job title */
  title: string
  /** Industry category */
  industry: InsightIndustry
  /** Years of experience required */
  experienceYears: number
  /** Salary in thousands (K) */
  salaryK: number
  /** Match score based on user profile (0-100) */
  matchScore: number
}

/**
 * Calendar cell for job posting intensity
 */
export interface JobCalendarCell {
  /** Date label (e.g., "Mar 1") */
  date: string
  /** Posting intensity score */
  intensity: number
}

/**
 * Filter options for network data visualization
 */
export interface NetworkFilters {
  /** Filter by industry, or "All" for no filter */
  industry: InsightIndustry | "All"
  /** Filter by location, or "All" for no filter */
  location: InsightLocation | "All"
  /** Minimum connection strength to include */
  minStrength: number
  /** Time range for data (30, 90, or 180 days) */
  timeRange: "30d" | "90d" | "180d"
}

/**
 * Complete dataset for network insights dashboard
 */
export interface NetworkInsightsDataset {
  /** Friend nodes for network graph */
  friendNodes: FriendNode[]
  /** Links between friends */
  friendLinks: FriendLink[]
  /** Friend growth over time */
  friendGrowth: FriendGrowthPoint[]
  /** Tribe/community bubbles */
  tribeBubbles: TribeBubble[]
  /** Groups in the network */
  groups: GroupNode[]
  /** Overlaps between groups */
  groupOverlaps: GroupOverlap[]
  /** Group activity metrics */
  groupActivity: GroupActivityPoint[]
  /** Group activity heatmap data */
  groupHeatmap: GroupHeatCell[]
  /** Job funnel nodes */
  jobFunnelNodes: JobFunnelNode[]
  /** Job funnel links */
  jobFunnelLinks: JobFunnelLink[]
  /** Job scatter plot data */
  jobScatter: JobScatterPoint[]
  /** Job posting calendar data */
  jobCalendar: JobCalendarCell[]
}

/** Available industry filter options including "All" */
export const INSIGHT_INDUSTRIES: readonly (InsightIndustry | "All")[] = [
  "All",
  "Engineering",
  "Data",
  "Product",
  "Design",
  "Marketing",
  "Operations",
  "Finance",
] as const

/** Available location filter options including "All" */
export const INSIGHT_LOCATIONS: readonly (InsightLocation | "All")[] = [
  "All",
  "San Francisco",
  "New York",
  "Austin",
  "Seattle",
  "Chicago",
  "Remote",
] as const

export const friendNodes: FriendNode[] = [
  {
    id: "f-1",
    label: "Avery Cole",
    role: "Staff Engineer",
    industry: "Engineering",
    location: "San Francisco",
    mutualConnections: 42,
    community: "Core",
    recommended: false,
    x: 16,
    y: 24,
  },
  {
    id: "f-2",
    label: "Jordan Kim",
    role: "VP Product",
    industry: "Product",
    location: "New York",
    mutualConnections: 36,
    community: "Growth",
    recommended: false,
    x: 28,
    y: 19,
  },
  {
    id: "f-3",
    label: "Morgan Diaz",
    role: "Data Lead",
    industry: "Data",
    location: "Seattle",
    mutualConnections: 33,
    community: "Core",
    recommended: false,
    x: 38,
    y: 31,
  },
  {
    id: "f-4",
    label: "Riley Shah",
    role: "Design Director",
    industry: "Design",
    location: "Remote",
    mutualConnections: 28,
    community: "Creative",
    recommended: true,
    x: 50,
    y: 20,
  },
  {
    id: "f-5",
    label: "Casey Lin",
    role: "Growth Manager",
    industry: "Marketing",
    location: "Chicago",
    mutualConnections: 24,
    community: "Growth",
    recommended: true,
    x: 62,
    y: 34,
  },
  {
    id: "f-6",
    label: "Taylor Brooks",
    role: "COO",
    industry: "Operations",
    location: "Austin",
    mutualConnections: 29,
    community: "Ops",
    recommended: false,
    x: 73,
    y: 22,
  },
  {
    id: "f-7",
    label: "Cameron Yoon",
    role: "Finance Partner",
    industry: "Finance",
    location: "New York",
    mutualConnections: 19,
    community: "Ops",
    recommended: false,
    x: 84,
    y: 33,
  },
  {
    id: "f-8",
    label: "Skyler Grant",
    role: "Senior Engineer",
    industry: "Engineering",
    location: "Austin",
    mutualConnections: 31,
    community: "Core",
    recommended: false,
    x: 22,
    y: 49,
  },
  {
    id: "f-9",
    label: "Drew Patel",
    role: "Product Designer",
    industry: "Design",
    location: "San Francisco",
    mutualConnections: 22,
    community: "Creative",
    recommended: true,
    x: 36,
    y: 56,
  },
  {
    id: "f-10",
    label: "Parker Singh",
    role: "ML Engineer",
    industry: "Data",
    location: "Seattle",
    mutualConnections: 27,
    community: "Core",
    recommended: false,
    x: 49,
    y: 45,
  },
  {
    id: "f-11",
    label: "Quinn Wright",
    role: "Brand Lead",
    industry: "Marketing",
    location: "Remote",
    mutualConnections: 18,
    community: "Growth",
    recommended: true,
    x: 63,
    y: 53,
  },
  {
    id: "f-12",
    label: "Reese Holt",
    role: "Program Manager",
    industry: "Operations",
    location: "Chicago",
    mutualConnections: 20,
    community: "Ops",
    recommended: false,
    x: 78,
    y: 48,
  },
  {
    id: "f-13",
    label: "Alex Monroe",
    role: "Engineering Manager",
    industry: "Engineering",
    location: "San Francisco",
    mutualConnections: 39,
    community: "Core",
    recommended: false,
    x: 17,
    y: 72,
  },
  {
    id: "f-14",
    label: "Jamie Park",
    role: "Head of Product",
    industry: "Product",
    location: "New York",
    mutualConnections: 34,
    community: "Growth",
    recommended: false,
    x: 31,
    y: 67,
  },
  {
    id: "f-15",
    label: "Kai Morgan",
    role: "Data Scientist",
    industry: "Data",
    location: "Remote",
    mutualConnections: 26,
    community: "Core",
    recommended: false,
    x: 46,
    y: 76,
  },
  {
    id: "f-16",
    label: "Sage Avery",
    role: "Community Lead",
    industry: "Marketing",
    location: "Austin",
    mutualConnections: 23,
    community: "Growth",
    recommended: true,
    x: 61,
    y: 70,
  },
  {
    id: "f-17",
    label: "Robin Cruz",
    role: "Design Manager",
    industry: "Design",
    location: "San Francisco",
    mutualConnections: 25,
    community: "Creative",
    recommended: false,
    x: 74,
    y: 78,
  },
  {
    id: "f-18",
    label: "Milan Reyes",
    role: "Head of Ops",
    industry: "Operations",
    location: "Chicago",
    mutualConnections: 21,
    community: "Ops",
    recommended: false,
    x: 86,
    y: 67,
  },
]

export const friendLinks: FriendLink[] = [
  { source: "f-1", target: "f-2", strength: 84 },
  { source: "f-1", target: "f-3", strength: 88 },
  { source: "f-1", target: "f-8", strength: 79 },
  { source: "f-2", target: "f-3", strength: 63 },
  { source: "f-2", target: "f-4", strength: 71 },
  { source: "f-2", target: "f-5", strength: 76 },
  { source: "f-3", target: "f-10", strength: 92 },
  { source: "f-3", target: "f-15", strength: 82 },
  { source: "f-4", target: "f-9", strength: 77 },
  { source: "f-4", target: "f-17", strength: 70 },
  { source: "f-5", target: "f-11", strength: 74 },
  { source: "f-5", target: "f-16", strength: 68 },
  { source: "f-6", target: "f-7", strength: 85 },
  { source: "f-6", target: "f-12", strength: 73 },
  { source: "f-7", target: "f-18", strength: 66 },
  { source: "f-8", target: "f-13", strength: 81 },
  { source: "f-8", target: "f-10", strength: 67 },
  { source: "f-9", target: "f-10", strength: 64 },
  { source: "f-10", target: "f-15", strength: 78 },
  { source: "f-11", target: "f-16", strength: 80 },
  { source: "f-12", target: "f-18", strength: 72 },
  { source: "f-13", target: "f-14", strength: 74 },
  { source: "f-14", target: "f-15", strength: 69 },
  { source: "f-14", target: "f-16", strength: 65, pending: true },
  { source: "f-15", target: "f-17", strength: 70 },
  { source: "f-16", target: "f-17", strength: 62, pending: true },
  { source: "f-17", target: "f-18", strength: 60 },
  { source: "f-5", target: "f-14", strength: 57 },
  { source: "f-3", target: "f-14", strength: 61 },
  { source: "f-9", target: "f-16", strength: 55, pending: true },
]

export const friendGrowth: FriendGrowthPoint[] = [
  { month: "Oct", friendsAdded: 18 },
  { month: "Nov", friendsAdded: 24 },
  { month: "Dec", friendsAdded: 19 },
  { month: "Jan", friendsAdded: 27 },
  { month: "Feb", friendsAdded: 33 },
  { month: "Mar", friendsAdded: 29 },
]

export const tribeBubbles: TribeBubble[] = [
  { id: "t-1", name: "Builder Core", category: "Tech", members: 12400, growthPct: 18, activityScore: 89, x: 18, y: 24 },
  { id: "t-2", name: "Product Orbit", category: "Business", members: 9800, growthPct: 14, activityScore: 82, x: 45, y: 28 },
  { id: "t-3", name: "Data Frontier", category: "Tech", members: 8600, growthPct: 21, activityScore: 91, x: 68, y: 22 },
  { id: "t-4", name: "Growth Guild", category: "Business", members: 7600, growthPct: 16, activityScore: 75, x: 30, y: 56 },
  { id: "t-5", name: "Design Circle", category: "Creative", members: 6400, growthPct: 12, activityScore: 73, x: 56, y: 55 },
  { id: "t-6", name: "Ops Collective", category: "Community", members: 5200, growthPct: 9, activityScore: 67, x: 76, y: 54 },
  { id: "t-7", name: "Founder Camp", category: "Business", members: 4300, growthPct: 11, activityScore: 64, x: 17, y: 76 },
  { id: "t-8", name: "AI Studio", category: "Tech", members: 7100, growthPct: 24, activityScore: 93, x: 47, y: 78 },
  { id: "t-9", name: "Creator Hub", category: "Creative", members: 3900, growthPct: 15, activityScore: 71, x: 74, y: 76 },
]

export const groups: GroupNode[] = [
  { id: "g-1", name: "Engineering Leaders", category: "Leadership", members: 5400, engagementScore: 82 },
  { id: "g-2", name: "Product Strategy", category: "Functional", members: 4300, engagementScore: 75 },
  { id: "g-3", name: "Data Operators", category: "Functional", members: 3700, engagementScore: 79 },
  { id: "g-4", name: "Bay Area Builders", category: "Local", members: 6100, engagementScore: 70 },
  { id: "g-5", name: "Marketing Innovators", category: "Industry", members: 4600, engagementScore: 74 },
  { id: "g-6", name: "Design Futures", category: "Functional", members: 3000, engagementScore: 68 },
]

export const groupOverlaps: GroupOverlap[] = [
  { source: "g-1", target: "g-2", sharedMembers: 420, topSharedFriends: ["Avery Cole", "Jordan Kim"] },
  { source: "g-1", target: "g-3", sharedMembers: 380, topSharedFriends: ["Morgan Diaz", "Parker Singh"] },
  { source: "g-1", target: "g-4", sharedMembers: 510, topSharedFriends: ["Alex Monroe", "Jamie Park"] },
  { source: "g-2", target: "g-5", sharedMembers: 460, topSharedFriends: ["Casey Lin", "Quinn Wright"] },
  { source: "g-2", target: "g-6", sharedMembers: 270, topSharedFriends: ["Riley Shah", "Drew Patel"] },
  { source: "g-3", target: "g-4", sharedMembers: 290, topSharedFriends: ["Parker Singh", "Kai Morgan"] },
  { source: "g-4", target: "g-5", sharedMembers: 350, topSharedFriends: ["Sage Avery", "Taylor Brooks"] },
  { source: "g-5", target: "g-6", sharedMembers: 230, topSharedFriends: ["Drew Patel", "Quinn Wright"] },
]

export const groupActivity: GroupActivityPoint[] = [
  { group: "Eng Leaders", posts: 122, comments: 351, joins: 46 },
  { group: "Product Strat", posts: 108, comments: 284, joins: 38 },
  { group: "Data Ops", posts: 97, comments: 260, joins: 35 },
  { group: "Bay Builders", posts: 131, comments: 312, joins: 51 },
  { group: "Mkt Innov", posts: 89, comments: 221, joins: 33 },
  { group: "Design Fut", posts: 76, comments: 199, joins: 27 },
]

export const groupHeatmap: GroupHeatCell[] = [
  { day: "Mon", period: "Morning", score: 56 },
  { day: "Mon", period: "Afternoon", score: 74 },
  { day: "Mon", period: "Evening", score: 41 },
  { day: "Tue", period: "Morning", score: 62 },
  { day: "Tue", period: "Afternoon", score: 79 },
  { day: "Tue", period: "Evening", score: 45 },
  { day: "Wed", period: "Morning", score: 65 },
  { day: "Wed", period: "Afternoon", score: 83 },
  { day: "Wed", period: "Evening", score: 49 },
  { day: "Thu", period: "Morning", score: 63 },
  { day: "Thu", period: "Afternoon", score: 77 },
  { day: "Thu", period: "Evening", score: 47 },
  { day: "Fri", period: "Morning", score: 58 },
  { day: "Fri", period: "Afternoon", score: 69 },
  { day: "Fri", period: "Evening", score: 52 },
  { day: "Sat", period: "Morning", score: 33 },
  { day: "Sat", period: "Afternoon", score: 44 },
  { day: "Sat", period: "Evening", score: 58 },
  { day: "Sun", period: "Morning", score: 28 },
  { day: "Sun", period: "Afternoon", score: 39 },
  { day: "Sun", period: "Evening", score: 61 },
]

export const jobFunnelNodes: JobFunnelNode[] = [
  { name: "LinkedOut" },
  { name: "Email Sync" },
  { name: "Referrals" },
  { name: "Screening" },
  { name: "Interview" },
  { name: "Offer" },
  { name: "Accepted" },
  { name: "Declined" },
  { name: "Rejected" },
]

export const jobFunnelLinks: JobFunnelLink[] = [
  { source: 0, target: 3, value: 182 },
  { source: 1, target: 3, value: 94 },
  { source: 2, target: 3, value: 66 },
  { source: 3, target: 4, value: 211 },
  { source: 3, target: 8, value: 131 },
  { source: 4, target: 5, value: 112 },
  { source: 4, target: 8, value: 99 },
  { source: 5, target: 6, value: 72 },
  { source: 5, target: 7, value: 40 },
]

export const jobScatter: JobScatterPoint[] = [
  { id: "j-1", title: "Senior Backend Engineer", industry: "Engineering", experienceYears: 7, salaryK: 185, matchScore: 91 },
  { id: "j-2", title: "Staff Data Engineer", industry: "Data", experienceYears: 8, salaryK: 205, matchScore: 88 },
  { id: "j-3", title: "Product Manager", industry: "Product", experienceYears: 6, salaryK: 168, matchScore: 84 },
  { id: "j-4", title: "Design Lead", industry: "Design", experienceYears: 7, salaryK: 172, matchScore: 79 },
  { id: "j-5", title: "Growth Marketing Lead", industry: "Marketing", experienceYears: 6, salaryK: 158, matchScore: 76 },
  { id: "j-6", title: "Revenue Operations Manager", industry: "Operations", experienceYears: 9, salaryK: 162, matchScore: 82 },
  { id: "j-7", title: "Finance Strategy Partner", industry: "Finance", experienceYears: 10, salaryK: 178, matchScore: 74 },
  { id: "j-8", title: "Principal ML Engineer", industry: "Data", experienceYears: 11, salaryK: 242, matchScore: 94 },
  { id: "j-9", title: "Engineering Manager", industry: "Engineering", experienceYears: 9, salaryK: 214, matchScore: 89 },
  { id: "j-10", title: "Director Product", industry: "Product", experienceYears: 12, salaryK: 236, matchScore: 85 },
]

export const jobCalendar: JobCalendarCell[] = [
  { date: "Mar 1", intensity: 18 },
  { date: "Mar 2", intensity: 23 },
  { date: "Mar 3", intensity: 35 },
  { date: "Mar 4", intensity: 41 },
  { date: "Mar 5", intensity: 29 },
  { date: "Mar 6", intensity: 14 },
  { date: "Mar 7", intensity: 37 },
  { date: "Mar 8", intensity: 44 },
  { date: "Mar 9", intensity: 52 },
  { date: "Mar 10", intensity: 48 },
  { date: "Mar 11", intensity: 31 },
  { date: "Mar 12", intensity: 22 },
  { date: "Mar 13", intensity: 26 },
  { date: "Mar 14", intensity: 33 },
]

/**
 * Returns a complete mock dataset for the network insights dashboard
 * @returns Complete NetworkInsightsDataset with all data arrays
 */
export function getMockNetworkInsightsDataset(): NetworkInsightsDataset {
  return {
    friendNodes,
    friendLinks,
    friendGrowth,
    tribeBubbles,
    groups,
    groupOverlaps,
    groupActivity,
    groupHeatmap,
    jobFunnelNodes,
    jobFunnelLinks,
    jobScatter,
    jobCalendar,
  }
}

/**
 * Returns the color associated with a community type
 * @param community - The community type to get color for
 * @returns Hex color string
 */
export function getCommunityColor(community: CommunityType): string {
  switch (community) {
    case "Core":
      return "#0A66C2"
    case "Growth":
      return "#00C853"
    case "Ops":
      return "#FF8F00"
    case "Creative":
      return "#8E24AA"
    default:
      return "#8B97A8"
  }
}

/**
 * Returns the color associated with an industry type
 * @param industry - The industry to get color for
 * @returns Hex color string
 */
export function getIndustryColor(industry: InsightIndustry): string {
  switch (industry) {
    case "Engineering":
      return "#0A66C2"
    case "Data":
      return "#1565C0"
    case "Product":
      return "#00ACC1"
    case "Design":
      return "#8E24AA"
    case "Marketing":
      return "#00C853"
    case "Operations":
      return "#EF6C00"
    case "Finance":
      return "#5D4037"
    default:
      return "#8B97A8"
  }
}

/**
 * Filters friend network nodes and links based on provided filters
 * @param filters - Filter criteria for industry, location, and strength
 * @param source - Optional custom source data; defaults to module exports
 * @returns Filtered nodes and links
 */
export function filterFriendNetwork(
  filters: NetworkFilters,
  source?: {
    nodes: FriendNode[]
    links: FriendLink[]
  },
): { nodes: FriendNode[]; links: FriendLink[] } {
  const nodesSource = source?.nodes || friendNodes
  const linksSource = source?.links || friendLinks

  const nodes = nodesSource.filter((node) => {
    if (filters.industry !== "All" && node.industry !== filters.industry) {
      return false
    }
    if (filters.location !== "All" && node.location !== filters.location) {
      return false
    }
    return true
  })

  const nodeSet = new Set(nodes.map((node) => node.id))
  const links = linksSource.filter(
    (link) =>
      link.strength >= filters.minStrength &&
      nodeSet.has(link.source) &&
      nodeSet.has(link.target),
  )

  return { nodes, links }
}

/**
 * Calculates the density of a network as a percentage
 * @param nodeCount - Number of nodes in the network
 * @param edgeCount - Number of edges/links in the network
 * @returns Density percentage (0-100), rounded to 1 decimal place
 */
export function calculateNetworkDensity(nodeCount: number, edgeCount: number): number {
  if (nodeCount < 2) {
    return 0
  }
  const maxEdges = (nodeCount * (nodeCount - 1)) / 2
  return Number(((edgeCount / maxEdges) * 100).toFixed(1))
}

/**
 * Builds a ranking of friends by total connection strength
 * @param nodes - Array of friend nodes to rank
 * @param links - Array of friend links to calculate strength from
 * @returns Top 6 friends ranked by total connection strength
 */
export function buildFriendStrengthRanking(
  nodes: FriendNode[],
  links: FriendLink[],
): Array<{ id: string; label: string; strength: number }> {
  const strengthMap = new Map<string, number>()
  for (const node of nodes) {
    strengthMap.set(node.id, 0)
  }
  for (const link of links) {
    strengthMap.set(link.source, (strengthMap.get(link.source) || 0) + link.strength)
    strengthMap.set(link.target, (strengthMap.get(link.target) || 0) + link.strength)
  }

  return nodes
    .map((node) => ({
      id: node.id,
      label: node.label,
      strength: strengthMap.get(node.id) || 0,
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 6)
}

/**
 * Retrieves a group by its ID
 * @param groupId - The ID of the group to find
 * @param groupList - Optional custom group list; defaults to module export
 * @returns The matching GroupNode, or undefined if not found
 */
export function getGroupById(groupId: string, groupList: GroupNode[] = groups): GroupNode | undefined {
  return groupList.find((group) => group.id === groupId)
}
