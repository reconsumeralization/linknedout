#!/bin/bash
# Migrate lib/ files into domain subdirectories and update all imports
set -e

ROOT="C:/Users/Amber/Downloads/OneDrive - varmsp/Apps/linknedout"
cd "$ROOT"

# Define file -> subdirectory mappings
declare -A MOVES

# auth/
MOVES[require-auth]=auth
MOVES[auth-redirect]=auth
MOVES[mcp-auth]=auth
MOVES[mcp-request-auth]=auth

# supabase/
MOVES[supabase]=supabase
MOVES[supabase-server]=supabase
MOVES[supabase-data]=supabase
MOVES[supabase-auth]=supabase
MOVES[supabase-client-auth]=supabase
MOVES[supabase-llm-db-tools]=supabase

# csv/
MOVES[csv-parser]=csv
MOVES[import-session]=csv

# security/
MOVES[mcp-tool-security]=security
MOVES[mcp-tool-audit]=security
MOVES[network-security]=security
MOVES[security-url]=security
MOVES[security-patterns]=security
MOVES[llm-guard]=security
MOVES[critical-workflow-policy]=security
MOVES[critical-verification-store]=security
MOVES[secure-crypto]=security
MOVES[aegis-policy]=security
MOVES[c2pa-manifest]=security

# sentinel/
MOVES[sentinel-types]=sentinel
MOVES[sentinel-engine]=sentinel
MOVES[sentinel-data]=sentinel
MOVES[sentinel-alerting]=sentinel
MOVES[sentinel-task-reality]=sentinel

# email/
MOVES[email-api-utils]=email
MOVES[email-data-server]=email
MOVES[email-intergrations]=email
MOVES[email-provider-adapters]=email

# linkedin/
MOVES[linkedin-consumer]=linkedin
MOVES[linkedin-identity-server]=linkedin
MOVES[linkedin-share-server]=linkedin
MOVES[linkedin-tools]=linkedin
MOVES[linkedin-pdf-parser]=linkedin
MOVES[linkedout-data]=linkedin
MOVES[linkedout-types]=linkedin

# agents/
MOVES[agent-platform-types]=agents
MOVES[agent-platform-server]=agents
MOVES[agent-platform-derived-metrics]=agents
MOVES[mcp-subagents]=agents

# network/
MOVES[network-insights-data]=network
MOVES[network-insights-supabase]=network

# globe/
MOVES[globe-live-data]=globe
MOVES[globe-governance-contracts]=globe

# realtime/
MOVES[realtime-client]=realtime
MOVES[realtime-tools]=realtime

# shared/
MOVES[types]=shared
MOVES[utils]=shared
MOVES[branding]=shared
MOVES[personas]=shared
MOVES[route-params]=shared
MOVES[request-body]=shared
MOVES[request-rate-limit]=shared
MOVES[rate-limit-redis]=shared
MOVES[panel-navigation-seeds]=shared
MOVES[analytics-panel-data]=shared
MOVES[google-drive]=shared
MOVES[web-search-tools]=shared
MOVES[drone-delivery-server]=shared
MOVES[drone-delivery-types]=shared
MOVES[tribe-design-preview-events]=shared

echo "=== Step 1: Move files ==="
for base in "${!MOVES[@]}"; do
  subdir="${MOVES[$base]}"
  # Move .ts file
  if [ -f "lib/${base}.ts" ]; then
    mv "lib/${base}.ts" "lib/${subdir}/${base}.ts"
    echo "  Moved lib/${base}.ts -> lib/${subdir}/${base}.ts"
  fi
  # Move .test.ts file if exists
  if [ -f "lib/${base}.test.ts" ]; then
    mv "lib/${base}.test.ts" "lib/${subdir}/${base}.test.ts"
    echo "  Moved lib/${base}.test.ts -> lib/${subdir}/${base}.test.ts"
  fi
done

echo ""
echo "=== Step 2: Update imports ==="
for base in "${!MOVES[@]}"; do
  subdir="${MOVES[$base]}"
  old_import="@/lib/${base}"
  new_import="@/lib/${subdir}/${base}"

  # Find and replace in all .ts, .tsx files (excluding node_modules, .next)
  grep -rl --include="*.ts" --include="*.tsx" --include="*.mjs" "${old_import}" \
    --exclude-dir=node_modules --exclude-dir=.next . 2>/dev/null | while read -r file; do
    sed -i "s|${old_import}|${new_import}|g" "$file"
    echo "  Updated import in: $file (${old_import} -> ${new_import})"
  done
done

# Also handle relative imports within lib/ files that reference sibling files
# e.g., from "./supabase-data" in lib/csv/import-session.ts
echo ""
echo "=== Step 3: Update relative imports within moved lib/ files ==="
for base in "${!MOVES[@]}"; do
  subdir="${MOVES[$base]}"
  target_file="lib/${subdir}/${base}.ts"
  target_test="lib/${subdir}/${base}.test.ts"

  for file in "$target_file" "$target_test"; do
    if [ ! -f "$file" ]; then
      continue
    fi

    # For each other moved module, update relative imports
    for other_base in "${!MOVES[@]}"; do
      other_subdir="${MOVES[$other_base]}"

      # Check if this file imports the other module with a relative path
      if grep -q "from ['\"]\./${other_base}['\"]" "$file" 2>/dev/null || \
         grep -q "from ['\"]\.\./${other_base}['\"]" "$file" 2>/dev/null || \
         grep -q "from ['\"\.]/${other_base}" "$file" 2>/dev/null; then

        if [ "$subdir" = "$other_subdir" ]; then
          # Same subdirectory - relative import stays as ./
          sed -i "s|from ['\"]\.\./${other_base}['\"]|from \"./${other_base}\"|g" "$file"
        else
          # Different subdirectory - need ../ prefix
          sed -i "s|from ['\"]\./${other_base}['\"]|from \"../${other_subdir}/${other_base}\"|g" "$file"
          sed -i "s|from ['\"]\.\./${other_base}['\"]|from \"../${other_subdir}/${other_base}\"|g" "$file"
        fi
      fi
    done
  done
done

echo ""
echo "=== Done! ==="
echo "Remaining files in lib/ root:"
ls lib/*.ts 2>/dev/null || echo "  (none)"
