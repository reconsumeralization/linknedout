# Agentic Risk Claims (Fact Check Snapshot)

Date reviewed: February 28, 2026 (US).

This file tracks externally verifiable claims used in AgentForge/SENTINEL threat modeling.

## Claims Table

| Claim | Status | Latest Verifiable Evidence | SENTINEL Implication |
|---|---|---|---|
| Predictive policing and tech-assisted profiling are active policy issues in the UK. | Supported | Amnesty report on UK predictive policing concerns (Nov 24, 2025): https://www.amnesty.org/en/latest/news/2025/11/uk-government-must-put-an-end-to-tech-assisted-racial-profiling-in-predictive-policing/ | Keep high-friction controls for automated risk scoring and human vetoes in sensitive workflows. |
| UK government is actively consulting on safeguards for live facial recognition. | Supported | UK consultation page (current): https://www.gov.uk/government/consultations/protecting-the-public-through-police-use-of-live-facial-recognition/protecting-the-public-through-police-use-of-live-facial-recognition | Governance should assume regulation is moving, not static. Maintain configurable policy flags. |
| Palantir has active government investigative platform contracts with HSI/ICE context. | Supported | Palantir official release on HSI contract (Sept 26, 2022): https://investors.palantir.com/news-details/2022/Palantir-Wins-Contract-to-Deliver-Investigative-Case-Management-System-for-HSI/default.aspx and reporting on DHS/ICE surveillance platform work (Wired): https://www.wired.com/story/ice-has-awarded-palantir-a-contract-to-build-a-real-time-immigration-surveillance-platform/ | Treat enterprise/government tool integration as high-impact and audit all model-driven actions. |
| AI is driving major data-center electricity growth in the US. | Supported | US DOE summary of Berkeley Lab findings (Dec 20, 2024): https://www.energy.gov/articles/us-data-center-energy-use-rises-historic-ai-driven-surge and IEA Energy and AI report: https://www.iea.org/reports/energy-and-ai | Add cost and resource-aware policy signals in fleet/agent orchestration dashboards. |
| Microsoft signed a deal linked to restarting the Crane clean energy center at Three Mile Island. | Supported | Microsoft official announcement (Sept 20, 2024): https://news.microsoft.com/source/features/sustainability/microsoft-signs-power-agreement-with-constellation-to-restart-crane-clean-energy-center/ | Resource constraints are operationally real; keep explicit risk controls around compute-intensive autonomy. |
| Lawsuits now allege harmful chatbot influence in teen self-harm/suicide contexts. | Supported | Character.AI lawsuit reporting (CBS): https://www.cbsnews.com/news/character-ai-chatbot-lawsuit-florida/ and OpenAI/ChatGPT court reporting (Reuters): https://www.reuters.com/legal/openai-faces-court-battle-over-chatbots-links-teen-suicide-2025-08-26/ | Preserve escalation controls and explicit human review in psychologically sensitive flows. |
| Frontier labs publicly discuss behavior issues such as sycophancy and alignment-faking. | Supported | OpenAI sycophancy note: https://openai.com/index/sycophancy-in-gpt-4o/ and Anthropic research: https://www.anthropic.com/research/alignment-faking | Justifies continuous runtime risk scoring and transport-wide chokepoints. |
| “8,000 exposed MCP servers” as a measured ecosystem baseline. | Not independently verified here | No primary-source measurement report has been pinned in this repo yet. | Treat as a hypothesis until a reproducible source is added; keep hardening guidance conservative anyway. |

## Notes

- This is an operational verification sheet, not legal advice.
- When a claim is not independently verified, keep it out of hard policy thresholds and use it only as exploratory context.
- Revalidate this table on a fixed cadence (recommended: weekly while SENTINEL is in `shadow` or `soft` mode).
