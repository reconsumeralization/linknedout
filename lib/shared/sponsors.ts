// Centralized sponsor registry — used by /sponsors page, feature badges, and integration hub

export interface Sponsor {
  name: string
  url: string
  category: "finance" | "security" | "infrastructure" | "ai" | "design" | "data" | "media" | "markets" | "commerce" | "identity"
  description: string
  powersFeature: string
  featureTools: string[]
  integrationAvailable: boolean
  badge: string  // short "Powered by X" label
}

export const SPONSORS: Sponsor[] = [
  // Finance & Operations
  { name: "Ramp", url: "https://Ramp.com", category: "finance", description: "Corporate card and spend management for sovereign operators.", powersFeature: "Refund Engine — SaaS stack audits, expense tracking, cognitive tariff calculations", featureTools: ["auditSaaSStack", "auditCognitiveTariff", "generateRefundDashboard"], integrationAvailable: true, badge: "Powered by Ramp" },
  { name: "Gusto", url: "https://gusto.com/tbpn", category: "finance", description: "Payroll, benefits, and HR for the sovereign entrepreneur.", powersFeature: "One-Click Sovereignty — automated entity formation, payroll, compliance", featureTools: ["generateExecutiveBrief"], integrationAvailable: true, badge: "Powered by Gusto" },
  { name: "Plaid", url: "https://plaid.com", category: "finance", description: "Financial data connectivity for crypto-rails and micro-settlements.", powersFeature: "Tribal Compute Pools — instant crypto-rail settlements between tribe members", featureTools: ["contributeToTribalComputePool", "stakeEnergyToTribe"], integrationAvailable: true, badge: "Powered by Plaid" },
  { name: "Phantom", url: "https://phantom.com/cash", category: "finance", description: "Crypto wallet for sovereign digital asset management.", powersFeature: "Cognitive Staking — royalty payments, tribal mission settlements, fleet payments", featureTools: ["publishCognitiveStake", "requestTribalFleet"], integrationAvailable: true, badge: "Powered by Phantom" },

  // Security & Compliance
  { name: "CrowdStrike", url: "https://crowdstrike.com", category: "security", description: "Endpoint security and threat intelligence at sovereign scale.", powersFeature: "MITRE Immune System — adversarial red teaming, herd immunity, defense posture", featureTools: ["runAgenticRedTeam", "getTribalHerdImmunity", "getDefensePosture"], integrationAvailable: true, badge: "Powered by CrowdStrike" },
  { name: "Vanta", url: "https://vanta.com", category: "security", description: "Automated security compliance (SOC2, HIPAA, ISO 27001).", powersFeature: "CCO Trust Audit — auto-compliance, parental controls BIOS, liability firewall", featureTools: ["aiCcoTrustAudit", "evaluateLiabilityFirewall", "configureParentalBios"], integrationAvailable: true, badge: "Powered by Vanta" },
  { name: "Okta", url: "https://www.okta.com", category: "identity", description: "Identity and access management for the sovereign civilization.", powersFeature: "Human Alpha Oracle — biometric verification, artifact handshakes, trust scores", featureTools: ["logHumanAlphaDecision", "performArtifactHandshake", "checkBiologicalHeartbeat"], integrationAvailable: true, badge: "Powered by Okta" },

  // Infrastructure & Deployment
  { name: "Railway", url: "https://railway.com", category: "infrastructure", description: "Instant deployment for sovereign factories.", powersFeature: "Agent Factory — one-click deployment of agentic pipelines and Neo Lab experiments", featureTools: ["launchFactoryPipeline", "assembleFactoryAgent", "factoryQualityGate"], integrationAvailable: true, badge: "Deployed on Railway" },
  { name: "MongoDB", url: "https://mongodb.com", category: "data", description: "Document database for tribal knowledge graphs.", powersFeature: "Collective Edge — tribal RAG, shared knowledge base, semantic network indexing", featureTools: ["contributeToKnowledgeBase", "queryMyNetwork", "queryAgentMemory"], integrationAvailable: true, badge: "Powered by MongoDB" },
  { name: "Turbopuffer", url: "https://turbopuffer.com", category: "data", description: "High-performance vector database for instant recall.", powersFeature: "Three-Tier Memory Palace — episodic, semantic, procedural memory at sovereign scale", featureTools: ["queryAgentMemory", "queryKnowledgeGPU"], integrationAvailable: true, badge: "Powered by Turbopuffer" },
  { name: "Lambda", url: "https://lambda.ai", category: "infrastructure", description: "GPU cloud for sovereign AI compute.", powersFeature: "Lunar Petawatt Grid — edge inference, SLM hosting, tribal compute pools", featureTools: ["activatePhotonicsEdge", "migrateToPetawattGrid", "initializeLunarForge"], integrationAvailable: true, badge: "Powered by Lambda" },
  { name: "Sentry", url: "https://sentry.io", category: "infrastructure", description: "Error monitoring and performance tracking.", powersFeature: "CTO Health Check — auto-healing infrastructure, error detection, quality control", featureTools: ["aiCtoHealthCheck", "reportToFailureLedger"], integrationAvailable: true, badge: "Monitored by Sentry" },
  { name: "Graphite", url: "https://graphite.com", category: "infrastructure", description: "Code review and rapid deployment workflows.", powersFeature: "Factory Quality Gate — rapid code review, self-improving codebase loops", featureTools: ["factoryQualityGate", "launchFactoryPipeline"], integrationAvailable: true, badge: "Reviewed by Graphite" },

  // AI & Intelligence
  { name: "Cognition", url: "https://cognition.ai", category: "ai", description: "AI software engineering (Devin) for autonomous code generation.", powersFeature: "Agent Factory — AI CTO that writes, tests, and deploys code autonomously", featureTools: ["assembleFactoryAgent", "launchDurableWorkflow"], integrationAvailable: false, badge: "Built with Cognition" },
  { name: "Gemini", url: "https://gemini.google.com", category: "ai", description: "Google's multimodal AI for cross-domain synthesis.", powersFeature: "Shadow Negotiator — real-time meeting intelligence, sentiment analysis", featureTools: ["activateShadowNegotiator", "queryQuantumOracle"], integrationAvailable: true, badge: "Powered by Gemini" },
  { name: "Labelbox", url: "https://labelbox.com", category: "ai", description: "Data labeling and RLHF infrastructure.", powersFeature: "Tribal RLHF — elder grading, agentic quarantine validation, bias detection", featureTools: ["gradeWithTribalRlhf", "quarantineAgent"], integrationAvailable: true, badge: "Labeled by Labelbox" },
  { name: "Fin", url: "https://fin.ai", category: "ai", description: "AI-powered customer support and knowledge management.", powersFeature: "Agentic Triage — intelligent DM filtering, commander's briefings", featureTools: ["setupAgenticTriage", "enterSovereignSanctuary"], integrationAvailable: false, badge: "Supported by Fin" },

  // Design & Media
  { name: "Figma", url: "https://figma.com", category: "design", description: "Collaborative design for sovereign UI/UX.", powersFeature: "Content Multiplier — one insight becomes design, audio, and broadcast", featureTools: ["amplifyContent", "aiCmoGrowthReport"], integrationAvailable: true, badge: "Designed in Figma" },
  { name: "ElevenLabs", url: "https://elevenlabs.io", category: "media", description: "AI voice synthesis for tribal communication.", powersFeature: "Content Amplification — podcast generation, tribal voice broadcasts", featureTools: ["amplifyContent", "synthesizeFeedItem"], integrationAvailable: true, badge: "Voice by ElevenLabs" },
  { name: "Restream", url: "https://restream.io", category: "media", description: "Multi-platform streaming for tribal broadcasts.", powersFeature: "CMO Growth Report — simultaneous streaming to all tribal channels", featureTools: ["aiCmoGrowthReport", "amplifyContent"], integrationAvailable: true, badge: "Streamed via Restream" },
  { name: "Vibe", url: "https://vibe.co", category: "media", description: "AI-powered video creation for rapid content.", powersFeature: "Content Factory — auto-generate launch videos, tribal announcements", featureTools: ["amplifyContent"], integrationAvailable: false, badge: "Created with Vibe" },

  // Markets & Commerce
  { name: "Kalshi", url: "https://kalshi.com", category: "markets", description: "Prediction markets for judgment-under-uncertainty.", powersFeature: "Skill Futures — stake on project outcomes, tool adoption predictions", featureTools: ["createSkillFuture", "queryQuantumOracle"], integrationAvailable: true, badge: "Markets by Kalshi" },
  { name: "Public", url: "https://public.com", category: "markets", description: "Social investing and market intelligence.", powersFeature: "Network Wealth — economic potential tracking, sovereign investment dashboards", featureTools: ["assessNetworkWealth", "getAgenticTokenBalance"], integrationAvailable: true, badge: "Investing via Public" },
  { name: "NYSE", url: "https://nyse.com", category: "markets", description: "Global equities marketplace and market data.", powersFeature: "CEO Executive Brief — real-time market signals for strategic C-Suite decisions", featureTools: ["generateExecutiveBrief", "scanCareerFlight"], integrationAvailable: false, badge: "Data from NYSE" },
  { name: "Shopify", url: "https://shopify.com/tbpn", category: "commerce", description: "Commerce platform for sovereign storefronts.", powersFeature: "Tariff Refund Calculator — international transaction scanning, duty drawbacks", featureTools: ["auditCognitiveTariff", "calculateMolecularRefund"], integrationAvailable: true, badge: "Commerce by Shopify" },

  // Connectivity & Platform
  { name: "Cisco", url: "https://www.cisco.com", category: "infrastructure", description: "Enterprise networking for sovereign infrastructure.", powersFeature: "Sovereign Failover — multi-cloud health monitoring, graceful degradation", featureTools: ["checkSovereignFailover"], integrationAvailable: false, badge: "Connected by Cisco" },
  { name: "AppLovin", url: "https://axon.ai", category: "ai", description: "AI-powered growth and user acquisition.", powersFeature: "CMO Growth Engine — tribal growth optimization, member acquisition", featureTools: ["aiCmoGrowthReport"], integrationAvailable: false, badge: "Growth by AppLovin" },
  { name: "Console", url: "https://console.com", category: "infrastructure", description: "Developer tools and infrastructure discovery.", powersFeature: "Agent Control Panel — tool discovery, sovereign stack management", featureTools: ["getFactoryDashboard"], integrationAvailable: false, badge: "Discovered via Console" },
  { name: "Linear", url: "https://linear.app", category: "infrastructure", description: "Project management for high-velocity teams.", powersFeature: "Sprint Board — micro-squad task management, tribal mission tracking", featureTools: ["createSprintTask", "formMicroSquad", "launchTribalMission"], integrationAvailable: true, badge: "Tracked in Linear" },
]

export const SPONSOR_CATEGORIES = {
  finance: { label: "Finance & Operations", icon: "DollarSign" },
  security: { label: "Security & Compliance", icon: "Shield" },
  infrastructure: { label: "Infrastructure & Deployment", icon: "Server" },
  ai: { label: "AI & Intelligence", icon: "Brain" },
  design: { label: "Design & Media", icon: "Palette" },
  data: { label: "Data & Storage", icon: "Database" },
  media: { label: "Media & Broadcast", icon: "Radio" },
  markets: { label: "Markets & Commerce", icon: "TrendingUp" },
  commerce: { label: "Commerce", icon: "ShoppingCart" },
  identity: { label: "Identity & Access", icon: "Fingerprint" },
} as const

export function getSponsorForTool(toolName: string): Sponsor | undefined {
  return SPONSORS.find(s => s.featureTools.includes(toolName))
}

export function getSponsorsByCategory(category: Sponsor["category"]): Sponsor[] {
  return SPONSORS.filter(s => s.category === category)
}

export function getIntegrableSponors(): Sponsor[] {
  return SPONSORS.filter(s => s.integrationAvailable)
}
