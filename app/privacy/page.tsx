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

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-block">&larr; Back to LinkedOut</Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 24, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Information We Collect</h2>
            <p className="text-muted-foreground">LinkedOut, operated by Hill &amp; Valley Gigastream, collects information you provide directly:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Account information (email, name) via Supabase authentication</li>
              <li>LinkedIn data you import (CSV exports, profile PDFs)</li>
              <li>Content you create (tribes, projects, cognitive stakes, agent lab experiments)</li>
              <li>AI interaction data (prompts, tool usage, Human Alpha decisions)</li>
              <li>Agentic memory data (episodic logs, durable workflow states)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Provide AI-powered analysis, tribe formation, and network intelligence</li>
              <li>Power the Agent Lab sandbox environments and cognitive staking marketplace</li>
              <li>Generate Cyborg C-Suite executive briefings and career flight alerts</li>
              <li>Calculate Tariff Refunds, Cognitive Tariffs, and SaaS stack audits</li>
              <li>Maintain the Three-Tier Memory Palace for your persistent agents</li>
              <li>Contribute anonymized patterns to the Anti-Hallucination Failure Ledger</li>
              <li>Track acceleration metrics (Cognitive Yield, Pivot Velocity, Tribal Learning Rate)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Data Processing &amp; AI Models</h2>
            <p className="text-muted-foreground">Your data is processed by AI models including Anthropic Claude, OpenAI GPT-4o, and Google Gemini to provide Platform features. We send only the minimum data necessary for each AI operation. AI model providers may have their own data policies. We do not use your data to train third-party AI models.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Parental Controls &amp; Memory Guardrails</h2>
            <p className="text-muted-foreground">You control your agent&rsquo;s memory through Parental Controls:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Set memory retention periods (auto-forget after N days)</li>
              <li>Define forbidden data sources your agents cannot access</li>
              <li>Configure budget limits for API costs</li>
              <li>The Sovereign Sanctuary silences notifications and creates Commander&rsquo;s Briefings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Tribal Data Sharing</h2>
            <p className="text-muted-foreground">The Agent Lab&rsquo;s Failure Ledger and Collective Edge features share anonymized patterns across tribe members. Your private Notion data, personal agents, and staked content are never shared without your explicit consent. The Anonymized Intelligence Layer extracts common patterns without exposing individual data.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Data Storage &amp; Security</h2>
            <p className="text-muted-foreground">Data is stored in Supabase (PostgreSQL) with Row Level Security (RLS) ensuring you can only access your own data. All connections are encrypted via TLS. We implement security best practices aligned with CrowdStrike and Vanta compliance standards. The Agentic Will feature ensures your data succession preferences are honored.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Your Rights</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Access:</strong> View all data associated with your account</li>
              <li><strong>Portability:</strong> Export your data at any time</li>
              <li><strong>Deletion:</strong> Request complete deletion of your data</li>
              <li><strong>Correction:</strong> Update inaccurate information</li>
              <li><strong>Memory Control:</strong> Purge agent episodic memory on demand</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Third-Party Services</h2>
            <p className="text-muted-foreground">LinkedOut integrates with third-party services for enhanced functionality. Each has its own privacy policy. We share only the minimum data required for integration.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Children&rsquo;s Privacy</h2>
            <p className="text-muted-foreground">LinkedOut&rsquo;s Education Bridge features are designed for K-12 students with appropriate parental/guardian oversight. We do not knowingly collect personal information from children under 13 without verified parental consent. The Skills Verification system allows age-blind capability assessment while protecting minor privacy.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Changes to This Policy</h2>
            <p className="text-muted-foreground">We may update this policy periodically. We will notify you of significant changes via the Platform&rsquo;s notification system or email.</p>
          </section>

          <section className="border-t border-border pt-8 mt-12">
            <h2 className="text-xl font-semibold mb-4">Sponsors &amp; Partners</h2>
            <p className="text-sm text-muted-foreground mb-2">LinkedOut is a Hill &amp; Valley Gigastream product. Apple&rsquo;s Next CEO, OpenAI&rsquo;s Non-Profit.</p>
            <p className="text-sm text-muted-foreground mb-4">TBPN.com is made possible by:</p>
            <div className="flex flex-wrap gap-2">
              {SPONSORS.map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
                  {s.name}
                </a>
              ))}
            </div>
          </section>

          <p className="text-xs text-muted-foreground mt-8">For privacy inquiries, contact: privacy@hillvalleygigastream.com</p>
        </div>
      </div>
    </div>
  )
}
