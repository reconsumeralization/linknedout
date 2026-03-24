import Link from "next/link"
import { SPONSORS, SPONSOR_CATEGORIES, type Sponsor } from "@/lib/shared/sponsors"

function CategorySection({ category, sponsors }: { category: string; sponsors: Sponsor[] }) {
  const config = SPONSOR_CATEGORIES[category as keyof typeof SPONSOR_CATEGORIES]
  if (!config || sponsors.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">{config.label}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sponsors.map((s) => (
          <div key={s.name} className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-foreground">{s.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
              </div>
              {s.integrationAvailable && (
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                  Integration Ready
                </span>
              )}
            </div>
            <div className="rounded-lg bg-muted/50 p-3 mb-3">
              <p className="text-xs font-medium text-foreground mb-1">Powers</p>
              <p className="text-xs text-muted-foreground">{s.powersFeature}</p>
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {s.featureTools.slice(0, 3).map((tool) => (
                <span key={tool} className="rounded-md border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {tool}
                </span>
              ))}
              {s.featureTools.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{s.featureTools.length - 3} more</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground italic">{s.badge}</span>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Visit {s.name}
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function SponsorsPage() {
  const categories = [...new Set(SPONSORS.map(s => s.category))]
  const integrable = SPONSORS.filter(s => s.integrationAvailable)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-block">
          &larr; Back to LinkedOut
        </Link>

        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-2">Sponsors &amp; Partners</h1>
          <p className="text-muted-foreground max-w-2xl">
            LinkedOut and TBPN.com are made possible by 29 industry-leading partners.
            Each sponsor powers a specific capability in the Sovereign Factory — from AI intelligence
            to financial sovereignty to cosmic infrastructure.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Hill &amp; Valley Gigastream &middot; Apple&apos;s Next CEO &middot; OpenAI&apos;s Non-Profit
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{SPONSORS.length}</p>
            <p className="text-xs text-muted-foreground">Total Partners</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">{integrable.length}</p>
            <p className="text-xs text-muted-foreground">Integration Ready</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-foreground">128</p>
            <p className="text-xs text-muted-foreground">Powered Tools</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{categories.length}</p>
            <p className="text-xs text-muted-foreground">Categories</p>
          </div>
        </div>

        {/* Sponsor Categories */}
        {categories.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            sponsors={SPONSORS.filter(s => s.category === cat)}
          />
        ))}

        <div className="mt-12 border-t border-border pt-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Interested in sponsoring LinkedOut? Contact us to power the next feature in the Sovereign Factory.
          </p>
          <p className="text-xs text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground underline">Terms</Link>
            {" · "}
            <Link href="/privacy" className="hover:text-foreground underline">Privacy</Link>
            {" · "}
            sponsors@hillvalleygigastream.com
          </p>
        </div>
      </div>
    </div>
  )
}
