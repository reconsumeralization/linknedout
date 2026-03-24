# AEGIS Non-Hardware Implementation

This project now applies the software-enforceable parts of the AEGIS PRD.

See also: `docs/aegis-doctrine.md` for the operator doctrine that is now embedded in runtime policy and UI surfaces.

## Implemented

1. Anthropomorphic and emotional limiters:
- Mandatory synthetic disclosure directives (Turing-denial style watermark behavior).
- Empathy-cap deflection rules for romantic/trauma patterns.
- Crisis deflection for self-harm terms with human-support routing language.
- Friction timers with cooldown enforcement after extended continuous usage.

2. Human-in-the-loop and coercion bans:
- Pre-crime enforcement ban (warrants/detention/arrest-before-crime requests blocked).
- Kinetic hard-lock software gate for tool names/arguments implying weapons or detention actuation.
- Recommendation-only stance enforced via system directives.

3. Prime directive software override:
- Default-to-off behavior for selected ambiguous high-risk ethical commands.
- Explicit human-safety supremacy directives injected into model instructions.

4. Epistemic transparency rules:
- System directives requiring `Unverified Probability` labels for low-confidence claims.
- Counter-argument forcing directives for complex political/philosophical/historical summary requests.

5. Turing freeze edge-case handling:
- Consciousness/sentience claim coercion patterns trigger a Turing-freeze style block requiring human review.

6. Rogue-model mitigation (software):
- Optional model allowlist gate (`AEGIS_ENFORCE_MODEL_ALLOWLIST`) for chat and realtime routes.

## Enforcement Points

- Chat route:
  - `app/api/chat/route.ts`
  - `evaluateAegisChatRequest(...)`
  - `evaluateAegisModelAccess(...)`
- Realtime session and client-secret routes:
  - `app/api/realtime/session/route.ts`
  - `app/api/realtime/client-secret/route.ts`
  - `buildAegisRealtimeInstructions(...)`
- Tool execution chokepoint:
  - `lib/realtime-tools.ts`
  - `evaluateAegisToolPolicy(...)`
- Policy engine:
  - `lib/aegis-policy.ts`

## Not Implemented (Hardware/Infrastructure-Only Requirements)

- ROM chip anchoring and hardware self-bricking.
- Quantum-resistant hardware keying.
- Multi-national decentralized kinetic unlock keys.
- OS-level outbound network quarantine for external non-AEGIS models.

These require platform/hardware or operating-system controls beyond this application layer.
