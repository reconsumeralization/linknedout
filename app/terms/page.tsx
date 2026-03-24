import Link from "next/link"

const SPONSORS = [
  { name: "Ramp", url: "https://Ramp.com" },
  { name: "AppLovin", url: "https://axon.ai" },
  { name: "Cisco", url: "https://www.cisco.com" },
  { name: "Cognition", url: "https://cognition.ai" },
  { name: "Console", url: "https://console.com" },
  { name: "CrowdStrike", url: "https://crowdstrike.com" },
  { name: "ElevenLabs", url: "https://elevenlabs.io" },
  { name: "Figma", url: "https://figma.com" },
  { name: "Fin", url: "https://fin.ai" },
  { name: "Gemini", url: "https://gemini.google.com" },
  { name: "Graphite", url: "https://graphite.com" },
  { name: "Gusto", url: "https://gusto.com/tbpn" },
  { name: "Kalshi", url: "https://kalshi.com" },
  { name: "Labelbox", url: "https://labelbox.com" },
  { name: "Lambda", url: "https://lambda.ai" },
  { name: "Linear", url: "https://linear.app" },
  { name: "MongoDB", url: "https://mongodb.com" },
  { name: "NYSE", url: "https://nyse.com" },
  { name: "Okta", url: "https://www.okta.com" },
  { name: "Phantom", url: "https://phantom.com/cash" },
  { name: "Plaid", url: "https://plaid.com" },
  { name: "Public", url: "https://public.com" },
  { name: "Railway", url: "https://railway.com" },
  { name: "Restream", url: "https://restream.io" },
  { name: "Sentry", url: "https://sentry.io" },
  { name: "Shopify", url: "https://shopify.com/tbpn" },
  { name: "Turbopuffer", url: "https://turbopuffer.com" },
  { name: "Vanta", url: "https://vanta.com" },
  { name: "Vibe", url: "https://vibe.co" },
] as const

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-block">&larr; Back to LinkedOut</Link>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 24, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">By accessing or using LinkedOut (&ldquo;the Platform&rdquo;), you agree to be bound by these Terms of Service. LinkedOut is an AI-powered LinkedIn CRM and Tribe Intelligence Platform operated by Hill &amp; Valley Gigastream. If you do not agree to these terms, do not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Platform Description</h2>
            <p className="text-muted-foreground">LinkedOut provides AI-augmented professional networking tools including: profile analysis, tribe formation, project management, network intelligence, an Agent Lab for experimentation, cognitive staking marketplace, durable agent workflows, and a Cyborg C-Suite of AI executives. The Platform is designed for high-agency professionals (&ldquo;Sovereign Artisans&rdquo;) seeking to leverage AI as a force multiplier.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. User Accounts &amp; Data</h2>
            <p className="text-muted-foreground">You are responsible for maintaining the confidentiality of your account credentials. Data you import (LinkedIn CSVs, PDFs, profile data) remains your property. LinkedOut processes this data using AI models to provide insights, tribe formation, and workflow automation. You may delete your data at any time.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Agent Lab &amp; Cognitive Staking</h2>
            <p className="text-muted-foreground">The Agent Lab provides sandbox environments for AI experimentation. Cognitive Stakes you publish to the tribal marketplace grant other members usage rights. Royalty structures are subject to Platform policies. The Anti-Hallucination Failure Ledger anonymizes and shares error patterns to benefit all tribe members. By using the Agent Lab, you consent to contributing anonymized experiment metadata to the Tribal Intelligence Graph.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. AI-Generated Content</h2>
            <p className="text-muted-foreground">LinkedOut uses AI models (including Claude, GPT-4o, and Gemini) to generate insights, recommendations, and automated workflows. AI-generated content may contain inaccuracies. You are the &ldquo;Human Chairman&rdquo; — the final decision-maker. LinkedOut and its AI C-Suite provide velocity; you provide judgment, ethics, and creative direction.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Acceptable Use</h2>
            <p className="text-muted-foreground">You agree not to: (a) use the Platform to send spam or unsolicited messages; (b) attempt to reverse-engineer AI models; (c) upload malicious content; (d) violate any applicable laws; (e) impersonate others or misrepresent your &ldquo;Proof of Build&rdquo; credentials; (f) manipulate the Human Alpha scoring system.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Intellectual Property</h2>
            <p className="text-muted-foreground">LinkedOut&rsquo;s source code, design, and AI tool implementations are the property of Hill &amp; Valley Gigastream. Cognitive Stakes you create remain your intellectual property, with a license granted to the Platform for tribal distribution per your staking terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Limitation of Liability</h2>
            <p className="text-muted-foreground">LinkedOut is provided &ldquo;as is&rdquo; without warranties. Hill &amp; Valley Gigastream shall not be liable for any indirect, incidental, or consequential damages arising from use of the Platform, including but not limited to: AI-generated recommendations, tariff refund calculations, career flight alerts, or Cyborg C-Suite executive briefings.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Termination</h2>
            <p className="text-muted-foreground">We may terminate or suspend your account at our discretion for violation of these terms. You may terminate your account at any time. Upon termination, your Agentic Will provisions (if configured) will be honored per your succession settings.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Governing Law</h2>
            <p className="text-muted-foreground">These terms are governed by the laws of the State of California, United States.</p>
          </section>

          <section className="border-t border-border pt-8 mt-12">
            <h2 className="text-xl font-semibold mb-4">Sponsors &amp; Partners</h2>
            <p className="text-sm text-muted-foreground mb-4">LinkedOut and TBPN.com are made possible by:</p>
            <div className="flex flex-wrap gap-2">
              {SPONSORS.map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
                  {s.name}
                </a>
              ))}
            </div>
          </section>

          <p className="text-xs text-muted-foreground mt-8">For questions about these terms, contact: legal@hillvalleygigastream.com</p>
        </div>
      </div>
    </div>
  )
}
