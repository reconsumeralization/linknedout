import { describe, expect, it } from "vitest"
import {
  buildFriendGrowthFromProfiles,
  buildGroupActivityFromWorkspace,
  buildGroupHeatmapFromActivity,
  buildJobCalendarFromProjects,
} from "@/lib/network/network-insights-supabase"

describe("network-insights-supabase", () => {
  it("builds historical friend growth from profile timestamps", () => {
    const growth = buildFriendGrowthFromProfiles(
      [
        { createdAt: "2025-10-05T10:00:00.000Z" },
        { createdAt: "2025-12-10T10:00:00.000Z" },
        { createdAt: "2025-12-12T10:00:00.000Z" },
        { createdAt: "2026-03-01T10:00:00.000Z" },
      ],
      { now: new Date("2026-03-15T12:00:00.000Z"), timeRange: "180d" },
    )

    expect(growth).toEqual([
      { month: "Sep", friendsAdded: 0 },
      { month: "Oct", friendsAdded: 1 },
      { month: "Nov", friendsAdded: 0 },
      { month: "Dec", friendsAdded: 2 },
      { month: "Jan", friendsAdded: 0 },
      { month: "Feb", friendsAdded: 0 },
      { month: "Mar", friendsAdded: 1 },
    ])
  })

  it("limits friend growth buckets to the requested time range", () => {
    const growth = buildFriendGrowthFromProfiles(
      [
        { createdAt: "2026-01-10T10:00:00.000Z" },
        { createdAt: "2026-02-18T10:00:00.000Z" },
        { createdAt: "2026-03-01T10:00:00.000Z" },
      ],
      { now: new Date("2026-03-15T12:00:00.000Z"), timeRange: "30d" },
    )

    expect(growth).toEqual([
      { month: "Feb", friendsAdded: 1 },
      { month: "Mar", friendsAdded: 1 },
    ])
  })

  it("builds a complete participation heatmap from activity timestamps", () => {
    const heatmap = buildGroupHeatmapFromActivity([
      { createdAt: "2026-03-02T09:00:00.000Z" },
      { createdAt: "2026-03-02T10:00:00.000Z" },
      { createdAt: "2026-03-03T15:00:00.000Z" },
    ])

    expect(heatmap).toHaveLength(21)
    expect(heatmap.find((cell) => cell.day === "Mon" && cell.period === "Morning")?.score).toBe(100)
    expect(heatmap.find((cell) => cell.day === "Tue" && cell.period === "Afternoon")?.score).toBe(50)
    expect(heatmap.find((cell) => cell.day === "Wed" && cell.period === "Evening")?.score).toBe(0)
  })

  it("ignores heatmap activity outside the selected time range", () => {
    const heatmap = buildGroupHeatmapFromActivity(
      [
        { createdAt: "2026-01-15T09:00:00.000Z" },
        { createdAt: "2026-03-02T09:00:00.000Z" },
      ],
      { now: new Date("2026-03-15T12:00:00.000Z"), timeRange: "30d" },
    )

    expect(heatmap.find((cell) => cell.day === "Mon" && cell.period === "Morning")?.score).toBe(100)
    expect(heatmap.find((cell) => cell.day === "Thu" && cell.period === "Morning")?.score).toBe(0)
  })

  it("builds group activity counts from recent tribe, profile, and project signals", () => {
    const activity = buildGroupActivityFromWorkspace(
      [
        {
          id: "group-builder-core",
          name: "Builder Core",
          category: "Leadership",
          members: 1200,
          engagementScore: 82,
        },
        {
          id: "group-product-orbit",
          name: "Product Orbit",
          category: "Functional",
          members: 980,
          engagementScore: 76,
        },
      ],
      {
        tribes: [
          {
            name: "Builder Core",
            createdAt: "2026-03-01T09:00:00.000Z",
            updatedAt: "2026-03-12T11:00:00.000Z",
          },
          {
            name: "Product Orbit",
            createdAt: "2025-12-01T09:00:00.000Z",
            updatedAt: "2026-01-02T11:00:00.000Z",
          },
        ],
        profiles: [
          {
            tribe: "Builder Core",
            createdAt: "2026-03-05T10:00:00.000Z",
            updatedAt: "2026-03-06T12:00:00.000Z",
          },
          {
            tribe: "Builder Core",
            createdAt: "2026-01-10T10:00:00.000Z",
            updatedAt: "2026-03-07T12:00:00.000Z",
          },
          {
            tribe: "Product Orbit",
            createdAt: "2025-12-01T10:00:00.000Z",
            updatedAt: "2026-03-08T12:00:00.000Z",
          },
        ],
        projects: [
          {
            tribe: "Builder Core",
            createdAt: "2026-03-02T10:00:00.000Z",
            updatedAt: "2026-03-09T13:00:00.000Z",
          },
          {
            tribe: "Product Orbit",
            createdAt: "2026-01-05T10:00:00.000Z",
            updatedAt: "2026-03-10T13:00:00.000Z",
          },
        ],
      },
      { now: new Date("2026-03-15T12:00:00.000Z"), timeRange: "30d" },
    )

    expect(activity).toEqual([
      { group: "Builder Core", posts: 2, comments: 3, joins: 2 },
      { group: "Product Orbi", posts: 1, comments: 1, joins: 0 },
    ])
  })

  it("bins project activity into the selected calendar window", () => {
    const calendar = buildJobCalendarFromProjects(
      [
        {
          createdAt: "2026-02-10T10:00:00.000Z",
          updatedAt: "2026-02-12T10:00:00.000Z",
        },
        {
          createdAt: "2026-02-20T10:00:00.000Z",
        },
        {
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      {
        now: new Date("2026-03-01T00:00:00.000Z"),
        timeRange: "30d",
        cellCount: 2,
      },
    )

    expect(calendar).toEqual([
      { date: "Jan 30", intensity: 100 },
      { date: "Feb 14", intensity: 50 },
    ])
  })
})
