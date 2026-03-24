import {
  __testing,
  extractRealtimeFunctionCalls,
  processRealtimeToolCallsFromServerEvent,
} from "@/lib/realtime/realtime-client"
import { beforeEach, describe, expect, it, vi } from "vitest"

function createJsonResponse(payload: unknown) {
  return {
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe("realtime-client", () => {
  beforeEach(() => {
    __testing.clearRecentToolCallDedupe()
    vi.unstubAllGlobals()
  })

  it("extracts function calls from response.done events", () => {
    const calls = extractRealtimeFunctionCalls({
      type: "response.done",
      response: {
        output: [
          {
            type: "function_call",
            name: "searchProfiles",
            call_id: "call_123",
            arguments: { keywords: "founder" },
          },
          {
            type: "output_text",
            text: "ignored",
          },
        ],
      },
    })

    expect(calls).toEqual([
      {
        name: "searchProfiles",
        callId: "call_123",
        arguments: { keywords: "founder" },
      },
    ])
  })

  it("dedupes duplicate successful tool calls across repeated realtime events", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        ok: true,
        conversationItem: { type: "conversation.item.create" },
        followupEvent: { type: "response.create" },
        output: { matches: [] },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const sendClientEvent = vi.fn()
    const onToolResult = vi.fn()
    const event = {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        name: "searchProfiles",
        call_id: "call_123",
        arguments: { keywords: "founder" },
      },
    }

    await processRealtimeToolCallsFromServerEvent(event, {
      sendClientEvent,
      onToolResult,
    })
    await processRealtimeToolCallsFromServerEvent(
      {
        type: "response.done",
        response: {
          output: [
            {
              type: "function_call",
              name: "searchProfiles",
              call_id: "call_123",
              arguments: { keywords: "founder" },
            },
          ],
        },
      },
      {
        sendClientEvent,
        onToolResult,
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sendClientEvent).toHaveBeenCalledTimes(2)
    expect(onToolResult).toHaveBeenCalledTimes(1)
  })

  it("allows a duplicate event to retry after a transport failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        createJsonResponse({
          ok: true,
          output: { matches: ["ok"] },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const onToolError = vi.fn()
    const onToolResult = vi.fn()
    const event = {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        name: "searchProfiles",
        call_id: "call_retry",
        arguments: { keywords: "ai" },
      },
    }

    await processRealtimeToolCallsFromServerEvent(event, {
      sendClientEvent: vi.fn(),
      onToolError,
      onToolResult,
    })
    await processRealtimeToolCallsFromServerEvent(event, {
      sendClientEvent: vi.fn(),
      onToolError,
      onToolResult,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onToolError).toHaveBeenCalledWith("network down")
    expect(onToolResult).toHaveBeenCalledTimes(1)
  })

  it("keeps duplicate handled error payloads deduped", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        ok: false,
        error: "approval required",
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const onToolError = vi.fn()
    const event = {
      type: "response.function_call_arguments.done",
      name: "sendEmail",
      call_id: "call_error",
      arguments: { to: ["test@example.com"] },
    }

    await processRealtimeToolCallsFromServerEvent(event, {
      sendClientEvent: vi.fn(),
      onToolError,
    })
    await processRealtimeToolCallsFromServerEvent(event, {
      sendClientEvent: vi.fn(),
      onToolError,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onToolError).toHaveBeenCalledTimes(1)
  })
})
