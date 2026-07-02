#!/bin/bash
set -e
cd "$(dirname "$0")/.."
export $(grep -E "^DATABASE_URL=" .env | xargs)
cd packages/database
npx prisma migrate deploy
echo "✅ Migrations applied"
