#!/usr/bin/env bash
set -euo pipefail

# LinkedOut Sovereign Factory — Supabase Setup Script
# Usage:
#   ./scripts/setup-supabase.sh local    # Start local Supabase (Docker required)
#   ./scripts/setup-supabase.sh cloud    # Instructions for cloud setup
#   ./scripts/setup-supabase.sh reset    # Reset local DB and re-apply migrations

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

case "${1:-help}" in
  local)
    echo "=== LinkedOut: Starting Local Supabase ==="
    echo ""

    # Check Docker
    if ! command -v docker &>/dev/null; then
      echo "ERROR: Docker is required for local Supabase."
      echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop"
      exit 1
    fi

    # Check supabase CLI
    if ! command -v supabase &>/dev/null; then
      echo "Installing Supabase CLI..."
      npm install -g supabase
    fi

    cd "$PROJECT_DIR"

    echo "Starting Supabase containers..."
    supabase start

    echo ""
    echo "=== Local Supabase is running ==="
    echo ""
    echo "Add these to your .env.local (or enter in Settings > Backend Configuration):"
    echo ""
    supabase status | grep -E "API URL|anon key|service_role key" || true
    echo ""
    echo "Studio: http://127.0.0.1:54323"
    echo ""
    echo "Migrations will be applied automatically."
    echo "Run 'supabase db reset' to re-apply all migrations from scratch."
    ;;

  cloud)
    echo "=== LinkedOut: Cloud Supabase Setup ==="
    echo ""
    echo "1. Create a project at https://supabase.com/dashboard"
    echo ""
    echo "2. Go to Project Settings > API to get your:"
    echo "   - Project URL (e.g., https://abc123.supabase.co)"
    echo "   - Anon Key (public)"
    echo "   - Service Role Key (server-side only)"
    echo ""
    echo "3. Run the bootstrap SQL in the SQL Editor:"
    echo "   File: supabase/bootstrap.sql ($(wc -l < "$PROJECT_DIR/supabase/bootstrap.sql") lines, 56 migrations)"
    echo ""
    echo "   Option A: Copy-paste into Dashboard > SQL Editor > New query"
    echo "   Option B: Use the CLI:"
    echo "     supabase db push --db-url 'postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres'"
    echo ""
    echo "4. Enter your URL and Anon Key in the app:"
    echo "   Settings > Backend Configuration > Supabase URL + Anon Key"
    echo ""
    echo "5. Enable Auth providers in Dashboard > Authentication > Providers:"
    echo "   - Email (enabled by default)"
    echo "   - Google OAuth (optional)"
    echo "   - GitHub OAuth (optional)"
    echo ""
    echo "Done! Sign in at /login to start using LinkedOut."
    ;;

  reset)
    echo "=== LinkedOut: Resetting Local Database ==="
    cd "$PROJECT_DIR"
    supabase db reset
    echo "All 56 migrations re-applied."
    ;;

  *)
    echo "LinkedOut Supabase Setup"
    echo ""
    echo "Usage:"
    echo "  $0 local   — Start local Supabase with Docker"
    echo "  $0 cloud   — Instructions for Supabase Cloud setup"
    echo "  $0 reset   — Reset local DB and re-apply all migrations"
    ;;
esac
