import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("MARKETPLACE_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "MARKETPLACE_RATE_LIMIT_MAX",
  "MARKETPLACE_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const ListingTypeEnum = z.enum([
  "service",
  "product",
  "experience",
  "education",
  "consulting",
  "mentorship",
  "digital_good",
])

const DeliveryMethodEnum = z.enum([
  "in_person",
  "virtual",
  "hybrid",
  "async",
  "shipped",
])

const OrderStatusEnum = z.enum([
  "pending",
  "confirmed",
  "in_progress",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
])

const CreateListingSchema = z.object({
  action: z.literal("create_listing"),
  listingType: ListingTypeEnum,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  deliveryMethod: DeliveryMethodEnum,
  location: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  maxCapacity: z.number().int().min(1).optional(),
  priceTokens: z.number().min(0).optional(),
  priceUsd: z.number().min(0).optional(),
  fulfillmentYield: z.number().min(0).max(100),
  humanAlphaRequired: z.array(z.string().min(1).max(120)).max(20).optional(),
  tribeId: z.string().max(120).optional(),
})

const UpdateListingSchema = z.object({
  action: z.literal("update_listing"),
  listingId: z.string().min(1).max(120),
  listingType: ListingTypeEnum.optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(4000).optional(),
  deliveryMethod: DeliveryMethodEnum.optional(),
  location: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  maxCapacity: z.number().int().min(1).optional(),
  priceTokens: z.number().min(0).optional(),
  priceUsd: z.number().min(0).optional(),
  fulfillmentYield: z.number().min(0).max(100).optional(),
  humanAlphaRequired: z.array(z.string().min(1).max(120)).max(20).optional(),
  tribeId: z.string().max(120).optional(),
  status: z.string().max(40).optional(),
})

const BrowseSchema = z.object({
  action: z.literal("browse"),
  listingType: z.string().max(60).optional(),
  deliveryMethod: z.string().max(60).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

const PlaceOrderSchema = z.object({
  action: z.literal("place_order"),
  listingId: z.string().min(1).max(120),
  paymentMethod: z.enum(["tokens", "usd", "barter"]),
  fulfillmentDate: z.string().max(60).optional(),
})

const UpdateOrderSchema = z.object({
  action: z.literal("update_order"),
  orderId: z.string().min(1).max(120),
  status: OrderStatusEnum,
  buyerFulfillmentYield: z.number().min(0).max(100).optional(),
  sellerFulfillmentYield: z.number().min(0).max(100).optional(),
})

const RateOrderSchema = z.object({
  action: z.literal("rate_order"),
  orderId: z.string().min(1).max(120),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().max(2000).optional(),
  buyerFulfillmentYield: z.number().min(0).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  CreateListingSchema,
  UpdateListingSchema,
  BrowseSchema,
  PlaceOrderSchema,
  UpdateOrderSchema,
  RateOrderSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `marketplace:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(
  payload: unknown,
  status: number,
  rateLimit: RateLimitResult,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
    },
  })
}

function createSupabaseClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  )
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
    )
  }

  const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!parsedBody.ok) {
    return jsonResponse({ ok: false, error: parsedBody.error }, parsedBody.status, rateLimit)
  }

  const parsed = PostRequestSchema.safeParse(parsedBody.value)
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: "Invalid request payload.",
        details: parsed.error.flatten(),
      },
      400,
      rateLimit,
    )
  }

  const input: PostRequest = parsed.data
  const authResult = await requireSupabaseAuth(req, {
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for this action." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const accessToken = authResult.auth.accessToken
  const userId = authResult.auth.userId
  const supabase = createSupabaseClient(accessToken)

  /* ---- create_listing ---- */
  if (input.action === "create_listing") {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .insert({
        seller_user_id: userId,
        listing_type: input.listingType,
        title: input.title,
        description: input.description,
        delivery_method: input.deliveryMethod,
        location: input.location ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        max_capacity: input.maxCapacity ?? null,
        price_tokens: input.priceTokens ?? null,
        price_usd: input.priceUsd ?? null,
        fulfillment_yield: input.fulfillmentYield,
        human_alpha_required: input.humanAlphaRequired ?? null,
        tribe_id: input.tribeId ?? null,
        status: "draft",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        listing: data,
      },
      200,
      rateLimit,
    )
  }

  /* ---- update_listing ---- */
  if (input.action === "update_listing") {
    const updates: Record<string, unknown> = {}
    if (input.listingType !== undefined) updates.listing_type = input.listingType
    if (input.title !== undefined) updates.title = input.title
    if (input.description !== undefined) updates.description = input.description
    if (input.deliveryMethod !== undefined) updates.delivery_method = input.deliveryMethod
    if (input.location !== undefined) updates.location = input.location
    if (input.latitude !== undefined) updates.latitude = input.latitude
    if (input.longitude !== undefined) updates.longitude = input.longitude
    if (input.maxCapacity !== undefined) updates.max_capacity = input.maxCapacity
    if (input.priceTokens !== undefined) updates.price_tokens = input.priceTokens
    if (input.priceUsd !== undefined) updates.price_usd = input.priceUsd
    if (input.fulfillmentYield !== undefined) updates.fulfillment_yield = input.fulfillmentYield
    if (input.humanAlphaRequired !== undefined) updates.human_alpha_required = input.humanAlphaRequired
    if (input.tribeId !== undefined) updates.tribe_id = input.tribeId
    if (input.status !== undefined) updates.status = input.status

    const { data, error } = await supabase
      .from("marketplace_listings")
      .update(updates)
      .eq("id", input.listingId)
      .eq("seller_user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        listing: data,
      },
      200,
      rateLimit,
    )
  }

  /* ---- browse ---- */
  if (input.action === "browse") {
    const limit = input.limit ?? 20
    const offset = input.offset ?? 0

    let query = supabase
      .from("marketplace_listings")
      .select("*", { count: "exact" })
      .eq("status", "active")

    if (input.listingType) {
      query = query.eq("listing_type", input.listingType)
    }
    if (input.deliveryMethod) {
      query = query.eq("delivery_method", input.deliveryMethod)
    }
    if (input.minPrice !== undefined) {
      query = query.gte("price_usd", input.minPrice)
    }
    if (input.maxPrice !== undefined) {
      query = query.lte("price_usd", input.maxPrice)
    }

    query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false })

    const { data, error, count } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        listings: data,
        total: count,
      },
      200,
      rateLimit,
    )
  }

  /* ---- place_order ---- */
  if (input.action === "place_order") {
    const { data: listing, error: listingError } = await supabase
      .from("marketplace_listings")
      .select("id, seller_user_id, price_tokens, price_usd")
      .eq("id", input.listingId)
      .single()

    if (listingError || !listing) {
      return jsonResponse({ ok: false, error: listingError?.message ?? "Listing not found." }, 404, rateLimit)
    }

    const priceAmount =
      input.paymentMethod === "tokens"
        ? listing.price_tokens
        : input.paymentMethod === "usd"
          ? listing.price_usd
          : null

    const { data, error } = await supabase
      .from("marketplace_orders")
      .insert({
        listing_id: input.listingId,
        buyer_user_id: userId,
        seller_user_id: listing.seller_user_id,
        payment_method: input.paymentMethod,
        price_amount: priceAmount,
        fulfillment_date: input.fulfillmentDate ?? null,
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        order: data,
      },
      200,
      rateLimit,
    )
  }

  /* ---- update_order ---- */
  if (input.action === "update_order") {
    const { data: existing, error: fetchError } = await supabase
      .from("marketplace_orders")
      .select("id, buyer_user_id, seller_user_id")
      .eq("id", input.orderId)
      .single()

    if (fetchError || !existing) {
      return jsonResponse({ ok: false, error: fetchError?.message ?? "Order not found." }, 404, rateLimit)
    }

    if (existing.buyer_user_id !== userId && existing.seller_user_id !== userId) {
      return jsonResponse({ ok: false, error: "Not authorised to update this order." }, 403, rateLimit)
    }

    const updates: Record<string, unknown> = { status: input.status }
    if (input.buyerFulfillmentYield !== undefined) updates.buyer_fulfillment_yield = input.buyerFulfillmentYield
    if (input.sellerFulfillmentYield !== undefined) updates.seller_fulfillment_yield = input.sellerFulfillmentYield

    const { data, error } = await supabase
      .from("marketplace_orders")
      .update(updates)
      .eq("id", input.orderId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        order: data,
      },
      200,
      rateLimit,
    )
  }

  /* ---- rate_order ---- */
  // This is the last branch in the discriminated union, so no `if` guard needed.
  const { data: order, error: orderError } = await supabase
    .from("marketplace_orders")
    .select("id, buyer_user_id, seller_user_id, listing_id, status")
    .eq("id", input.orderId)
    .single()

  if (orderError || !order) {
    return jsonResponse({ ok: false, error: orderError?.message ?? "Order not found." }, 404, rateLimit)
  }

  if (order.status !== "completed" && order.status !== "delivered") {
    return jsonResponse(
      { ok: false, error: "Order must be completed or delivered before rating." },
      400,
      rateLimit,
    )
  }

  const ratingUpdates: Record<string, unknown> = {
    rating: input.rating,
    review_text: input.reviewText ?? null,
  }
  if (input.buyerFulfillmentYield !== undefined) {
    ratingUpdates.buyer_fulfillment_yield = input.buyerFulfillmentYield
  }

  const { data: updatedOrder, error: rateError } = await supabase
    .from("marketplace_orders")
    .update(ratingUpdates)
    .eq("id", input.orderId)
    .select()
    .single()

  if (rateError) {
    return jsonResponse({ ok: false, error: rateError.message }, 400, rateLimit)
  }

  // Update listing avg_rating
  const { data: allRatings } = await supabase
    .from("marketplace_orders")
    .select("rating")
    .eq("listing_id", order.listing_id)
    .not("rating", "is", null)

  if (allRatings && allRatings.length > 0) {
    const avg =
      allRatings.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / allRatings.length

    await supabase
      .from("marketplace_listings")
      .update({ avg_rating: Math.round(avg * 100) / 100 })
      .eq("id", order.listing_id)
  }

  return jsonResponse(
    {
      ok: true,
      action: input.action,
      order: updatedOrder,
    },
    200,
    rateLimit,
  )
}
