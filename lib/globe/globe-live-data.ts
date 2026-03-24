import type { SupabaseProfileView, SupabaseProjectView } from "@/lib/supabase/supabase-data"
import type { GlobeConnectionLine, GlobeProfileDot, GlobeProjectArc, GlobeTribeCluster, Tribe } from "@/lib/shared/types"

export type GlobeLiveDataSnapshot = {
  profileDots: GlobeProfileDot[]
  tribeClusters: GlobeTribeCluster[]
  projectArcs: GlobeProjectArc[]
  connectionLines: GlobeConnectionLine[]
}

type Coordinates = {
  longitude: number
  latitude: number
}

type LocatedProfileDot = GlobeProfileDot & {
  tribeKey?: string
  tribeLabel?: string
}

type LocatedTribeCluster = GlobeTribeCluster & {
  tribeKey: string
}

const EMPTY_SNAPSHOT: GlobeLiveDataSnapshot = {
  profileDots: [],
  tribeClusters: [],
  projectArcs: [],
  connectionLines: [],
}

const TRIBE_COLORS: Array<[number, number, number]> = [
  [59, 130, 246],
  [16, 185, 129],
  [245, 158, 11],
  [239, 68, 68],
  [168, 85, 247],
  [34, 197, 94],
]

const REMOTE_HUBS: Coordinates[] = [
  { longitude: -122.4194, latitude: 37.7749 },
  { longitude: -74.006, latitude: 40.7128 },
  { longitude: -0.1276, latitude: 51.5072 },
  { longitude: 103.8198, latitude: 1.3521 },
  { longitude: 151.2093, latitude: -33.8688 },
]

const LOCATION_MATCHERS: Array<{ keywords: string[]; coordinates: Coordinates }> = [
  { keywords: ["san francisco", "bay area"], coordinates: { longitude: -122.4194, latitude: 37.7749 } },
  { keywords: ["new york", "nyc"], coordinates: { longitude: -74.006, latitude: 40.7128 } },
  { keywords: ["chicago"], coordinates: { longitude: -87.6298, latitude: 41.8781 } },
  { keywords: ["london"], coordinates: { longitude: -0.1276, latitude: 51.5072 } },
  { keywords: ["paris"], coordinates: { longitude: 2.3522, latitude: 48.8566 } },
  { keywords: ["berlin"], coordinates: { longitude: 13.405, latitude: 52.52 } },
  { keywords: ["tokyo"], coordinates: { longitude: 139.6917, latitude: 35.6895 } },
  { keywords: ["sydney"], coordinates: { longitude: 151.2093, latitude: -33.8688 } },
  { keywords: ["rio de janeiro", "rio"], coordinates: { longitude: -43.1729, latitude: -22.9068 } },
  { keywords: ["toronto"], coordinates: { longitude: -79.3832, latitude: 43.6532 } },
  { keywords: ["cape town"], coordinates: { longitude: 18.4241, latitude: -33.9249 } },
  { keywords: ["singapore"], coordinates: { longitude: 103.8198, latitude: 1.3521 } },
  { keywords: ["delhi", "new delhi"], coordinates: { longitude: 77.209, latitude: 28.6139 } },
  { keywords: ["moscow"], coordinates: { longitude: 37.6173, latitude: 55.7558 } },
  { keywords: ["istanbul"], coordinates: { longitude: 28.9784, latitude: 41.0082 } },
  { keywords: ["mexico city"], coordinates: { longitude: -99.1332, latitude: 19.4326 } },
  { keywords: ["melbourne"], coordinates: { longitude: 144.9631, latitude: -37.8136 } },
  { keywords: ["madrid"], coordinates: { longitude: -3.7038, latitude: 40.4168 } },
  { keywords: ["austin"], coordinates: { longitude: -97.7431, latitude: 30.2672 } },
  { keywords: ["seattle"], coordinates: { longitude: -122.3321, latitude: 47.6062 } },
  { keywords: ["boston"], coordinates: { longitude: -71.0589, latitude: 42.3601 } },
  { keywords: ["los angeles"], coordinates: { longitude: -118.2437, latitude: 34.0522 } },
  { keywords: ["washington dc", "washington, dc"], coordinates: { longitude: -77.0369, latitude: 38.9072 } },
]

function hashString(input: string): number {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }
  return hash
}

function normalizeText(value: string | undefined): string {
  return (value || "").trim().toLowerCase()
}

function normalizeTribeKey(value: string | undefined): string | undefined {
  const normalized = normalizeText(value)
  if (!normalized) {
    return undefined
  }
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function buildProfileName(profile: SupabaseProfileView): string {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim()
  if (fullName) {
    return fullName
  }
  return profile.company || "Profile"
}

function displayTribeLabel(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function applyDeterministicJitter(
  coordinates: Coordinates,
  seed: string,
  longitudeSpread = 0.8,
  latitudeSpread = 0.55,
): Coordinates {
  const hash = hashString(seed)
  const longitudeOffset = ((((hash & 0xff) / 255) - 0.5) * longitudeSpread)
  const latitudeOffset = (((((hash >> 8) & 0xff) / 255) - 0.5) * latitudeSpread)
  return {
    longitude: Math.max(-179.5, Math.min(179.5, coordinates.longitude + longitudeOffset)),
    latitude: Math.max(-80, Math.min(80, coordinates.latitude + latitudeOffset)),
  }
}

function coordinatesEqual(left: Coordinates, right: Coordinates): boolean {
  return Math.abs(left.longitude - right.longitude) < 0.01 && Math.abs(left.latitude - right.latitude) < 0.01
}

function squaredDistance(left: Coordinates, right: Coordinates): number {
  const longitudeDelta = left.longitude - right.longitude
  const latitudeDelta = left.latitude - right.latitude
  return longitudeDelta * longitudeDelta + latitudeDelta * latitudeDelta
}

export function resolveGlobeCoordinates(location: string, seed = location): Coordinates | null {
  const normalized = normalizeText(location)
  if (!normalized) {
    return null
  }

  if (normalized.includes("remote")) {
    const hub = REMOTE_HUBS[hashString(seed) % REMOTE_HUBS.length]
    return applyDeterministicJitter(hub, `remote:${seed}`, 8, 5)
  }

  for (const entry of LOCATION_MATCHERS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return applyDeterministicJitter(entry.coordinates, seed)
    }
  }

  if (normalized.includes("united states") || normalized.includes("usa")) {
    return applyDeterministicJitter({ longitude: -98.5795, latitude: 39.8283 }, seed, 6, 4)
  }
  if (normalized.includes("europe")) {
    return applyDeterministicJitter({ longitude: 10.4515, latitude: 51.1657 }, seed, 8, 5)
  }
  if (normalized.includes("asia")) {
    return applyDeterministicJitter({ longitude: 100.6197, latitude: 34.0479 }, seed, 10, 6)
  }

  return null
}

function centroid(coordinates: Coordinates[]): Coordinates | null {
  if (coordinates.length === 0) {
    return null
  }
  const totals = coordinates.reduce(
    (current, item) => ({
      longitude: current.longitude + item.longitude,
      latitude: current.latitude + item.latitude,
    }),
    { longitude: 0, latitude: 0 },
  )
  return {
    longitude: totals.longitude / coordinates.length,
    latitude: totals.latitude / coordinates.length,
  }
}

function buildProfileDots(profiles: SupabaseProfileView[] | null | undefined): LocatedProfileDot[] {
  const dots: Array<LocatedProfileDot | null> = (profiles || []).map((profile) => {
    const coordinates = resolveGlobeCoordinates(profile.location, profile.id || buildProfileName(profile))
    if (!coordinates) {
      return null
    }
    const dot: LocatedProfileDot = {
      id: profile.id,
      name: buildProfileName(profile),
      headline: profile.headline || profile.seniority || "Profile",
      longitude: coordinates.longitude,
      latitude: coordinates.latitude,
      tribeId: normalizeTribeKey(profile.tribe),
      tribeKey: normalizeTribeKey(profile.tribe),
      tribeLabel: profile.tribe,
      connectionCount: Math.max(0, profile.connections || 0),
    }
    return dot
  })

  return dots
    .filter((item): item is LocatedProfileDot => Boolean(item))
    .sort((left, right) => right.connectionCount - left.connectionCount || left.name.localeCompare(right.name))
    .slice(0, 160)
}

function buildTribeClusters(
  profileDots: LocatedProfileDot[],
  tribes: Tribe[] | null | undefined,
  projects: SupabaseProjectView[] | null | undefined,
): LocatedTribeCluster[] {
  const profileGroups = new Map<string, LocatedProfileDot[]>()
  for (const profile of profileDots) {
    if (!profile.tribeKey) {
      continue
    }
    if (!profileGroups.has(profile.tribeKey)) {
      profileGroups.set(profile.tribeKey, [])
    }
    profileGroups.get(profile.tribeKey)?.push(profile)
  }

  if (tribes && tribes.length > 0) {
    return tribes
      .map((tribe, index) => {
        const nameKey = normalizeTribeKey(tribe.name)
        const idKey = normalizeTribeKey(tribe.id)
        const matchedProfiles = profileDots.filter(
          (profile) =>
            (nameKey && profile.tribeKey === nameKey) ||
            (idKey && profile.tribeKey === idKey) ||
            tribe.members.some((member) => member.personId === profile.id),
        )
        const center = centroid(
          matchedProfiles.map((profile) => ({
            longitude: profile.longitude,
            latitude: profile.latitude,
          })),
        )
        if (!center) {
          return null
        }
        const linkedProjects = (projects || []).filter((project) => {
          const projectTribeKey = normalizeTribeKey(project.tribe)
          return Boolean(projectTribeKey && (projectTribeKey === nameKey || projectTribeKey === idKey))
        })
        return {
          id: tribe.id,
          tribeKey: nameKey || idKey || `tribe-${index + 1}`,
          name: tribe.name,
          memberCount: Math.max(tribe.members.length, matchedProfiles.length, linkedProjects.length),
          longitude: center.longitude,
          latitude: center.latitude,
          color: TRIBE_COLORS[index % TRIBE_COLORS.length],
        }
      })
      .filter((item): item is LocatedTribeCluster => Boolean(item))
  }

  return Array.from(profileGroups.entries())
    .map(([tribeKey, members], index) => {
      const center = centroid(
        members.map((profile) => ({
          longitude: profile.longitude,
          latitude: profile.latitude,
        })),
      )
      if (!center) {
        return null
      }
      return {
        id: tribeKey,
        tribeKey,
        name: members[0]?.tribeLabel || displayTribeLabel(tribeKey) || `Tribe ${index + 1}`,
        memberCount: members.length,
        longitude: center.longitude,
        latitude: center.latitude,
        color: TRIBE_COLORS[index % TRIBE_COLORS.length],
      }
    })
    .filter((item): item is LocatedTribeCluster => Boolean(item))
}

function buildConnectionLines(
  profileDots: LocatedProfileDot[],
  tribeClusters: LocatedTribeCluster[],
): GlobeConnectionLine[] {
  const clusterByKey = new Map(tribeClusters.map((cluster) => [cluster.tribeKey, cluster]))
  const lines: GlobeConnectionLine[] = []

  for (const profile of profileDots) {
    if (!profile.tribeKey) {
      continue
    }
    const cluster = clusterByKey.get(profile.tribeKey)
    if (!cluster) {
      continue
    }
    const source = { longitude: profile.longitude, latitude: profile.latitude }
    const target = { longitude: cluster.longitude, latitude: cluster.latitude }
    if (coordinatesEqual(source, target)) {
      continue
    }
    lines.push({
      sourcePosition: [source.longitude, source.latitude],
      targetPosition: [target.longitude, target.latitude],
    })
  }

  if (lines.length > 0) {
    return lines.slice(0, 120)
  }

  const fallbackProfiles = profileDots.slice(0, 24)
  for (let index = 1; index < fallbackProfiles.length; index += 1) {
    lines.push({
      sourcePosition: [fallbackProfiles[index - 1].longitude, fallbackProfiles[index - 1].latitude],
      targetPosition: [fallbackProfiles[index].longitude, fallbackProfiles[index].latitude],
    })
  }
  return lines
}

function buildProjectArcs(
  projects: SupabaseProjectView[] | null | undefined,
  profileDots: LocatedProfileDot[],
  tribeClusters: LocatedTribeCluster[],
): GlobeProjectArc[] {
  const clusterByKey = new Map(tribeClusters.map((cluster) => [cluster.tribeKey, cluster]))
  const arcs: GlobeProjectArc[] = []

  for (const project of projects || []) {
    const projectTribeKey = normalizeTribeKey(project.tribe)
    const scopedProfiles = projectTribeKey
      ? profileDots.filter((profile) => profile.tribeKey === projectTribeKey)
      : profileDots
    if (scopedProfiles.length === 0) {
      continue
    }

    const source = scopedProfiles[0]
    let targetCoordinates: Coordinates | null = null
    let bestDistance = 0

    for (let index = 1; index < scopedProfiles.length; index += 1) {
      const candidate = scopedProfiles[index]
      const distance = squaredDistance(
        { longitude: source.longitude, latitude: source.latitude },
        { longitude: candidate.longitude, latitude: candidate.latitude },
      )
      if (distance > bestDistance) {
        bestDistance = distance
        targetCoordinates = { longitude: candidate.longitude, latitude: candidate.latitude }
      }
    }

    if (!targetCoordinates && projectTribeKey) {
      const cluster = clusterByKey.get(projectTribeKey)
      if (cluster) {
        targetCoordinates = { longitude: cluster.longitude, latitude: cluster.latitude }
      }
    }

    if (!targetCoordinates) {
      continue
    }

    const sourceCoordinates = { longitude: source.longitude, latitude: source.latitude }
    if (coordinatesEqual(sourceCoordinates, targetCoordinates)) {
      continue
    }

    arcs.push({
      id: project.id,
      name: project.name,
      sourcePosition: [sourceCoordinates.longitude, sourceCoordinates.latitude],
      targetPosition: [targetCoordinates.longitude, targetCoordinates.latitude],
      tribeId: projectTribeKey,
    })
  }

  return arcs.slice(0, 40)
}

export function buildGlobeLiveData(input: {
  profiles?: SupabaseProfileView[] | null
  tribes?: Tribe[] | null
  projects?: SupabaseProjectView[] | null
}): GlobeLiveDataSnapshot {
  const profileDots = buildProfileDots(input.profiles)
  if (profileDots.length === 0 && (!input.tribes || input.tribes.length === 0) && (!input.projects || input.projects.length === 0)) {
    return EMPTY_SNAPSHOT
  }

  const tribeClusters = buildTribeClusters(profileDots, input.tribes, input.projects)
  const connectionLines = buildConnectionLines(profileDots, tribeClusters)
  const projectArcs = buildProjectArcs(input.projects, profileDots, tribeClusters)

  return {
    profileDots,
    tribeClusters,
    projectArcs,
    connectionLines,
  }
}
