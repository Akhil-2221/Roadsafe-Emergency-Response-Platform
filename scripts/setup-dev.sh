#!/bin/bash
# RoadSafe Emergency - One-command dev setup
set -e
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
info() { echo -e "${GREEN}✅${NC} $1"; }
warn() { echo -e "${YELLOW}⚠️${NC} $1"; }
error() { echo -e "${RED}❌${NC} $1"; }

echo -e "${BOLD}🚨 RoadSafe Emergency - Development Setup${NC}"
echo "============================================="

# 1. Node version check
NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_VER" -lt 18 ] && { error "Node 18+ required. Got $(node -v)"; exit 1; }
info "Node $(node -v)"

# 2. Setup .env
if [ ! -f ".env" ]; then
  cp .env.example .env
  # Auto-generate secrets
  JWT=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
  REF=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
  QRS=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
  CSK=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
  SED="sed -i"
  [[ "$OSTYPE" == "darwin"* ]] && SED="sed -i ''"
  $SED "s|dev_jwt_secret_min_32_characters_here_1234|${JWT}|g" .env
  $SED "s|dev_refresh_secret_min_32_characters_here|${REF}|g" .env
  $SED "s|dev_qr_secret_min_32_characters_here_1234|${QRS}|g" .env
  $SED "s|dev_cookie_secret_min_32_characters_here|${CSK}|g" .env
  info ".env created with auto-generated secrets"
else
  info ".env already exists"
fi

# 3. Start infra
echo -e "\n${BOLD}Starting PostgreSQL + Redis...${NC}"
docker compose up postgres redis -d 2>/dev/null || docker-compose up postgres redis -d
echo "Waiting for database..."
for i in {1..20}; do
  docker compose exec postgres pg_isready -U roadsafe -q 2>/dev/null && break || sleep 1
done
info "Database ready"

# 4. Install API deps
echo -e "\n${BOLD}Installing API dependencies...${NC}"
cd services/api && npm install --silent && cd ../..
info "API dependencies installed"

# 5. DB setup
echo -e "\n${BOLD}Setting up database...${NC}"
cd packages/database && npm install --silent 2>/dev/null || true
export DATABASE_URL=$(grep DATABASE_URL ../../.env | cut -d'=' -f2-)
# Use db push for initial setup (faster than migrate for dev)
cd ../../services/api
npx prisma db push --skip-generate 2>&1 | tail -3
npx prisma generate 2>&1 | tail -1
cd ../..
info "Schema pushed to database"

# 6. Seed
echo -e "\n${BOLD}Seeding database...${NC}"
cd packages/database && npm install --silent 2>/dev/null || true
export DATABASE_URL=$(grep DATABASE_URL ../../.env | cut -d'=' -f2-)
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
cd ../..
info "Database seeded"

# 7. Install web deps
echo -e "\n${BOLD}Installing web dependencies...${NC}"
cd apps/web && npm install --silent && cd ../..
info "Web dependencies installed"

# 8. Install AI deps
if command -v pip3 &>/dev/null; then
  echo -e "\n${BOLD}Installing AI dependencies...${NC}"
  pip3 install -r services/ai/requirements.txt -q
  info "AI dependencies installed"
else
  warn "Python/pip3 not found — AI service will run in Docker only"
fi

echo ""
echo -e "${BOLD}${GREEN}✅ Setup complete!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BOLD}Start the application (3 terminals):${NC}"
echo ""
echo "  Terminal 1 — API:"
echo "  cd services/api && npm run dev"
echo ""
echo "  Terminal 2 — AI Service:"
echo "  cd services/ai && uvicorn app.main:app --reload --port 8000"
echo ""
echo "  Terminal 3 — Frontend:"
echo "  cd apps/web && npm run dev"
echo ""
echo -e "${BOLD}Or use Docker (all-in-one):${NC}"
echo "  docker-compose up --build"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BOLD}Access:${NC}"
echo "  🌐 App:      http://localhost:3000"
echo "  🔌 API:      http://localhost:3001"
echo "  🤖 AI Docs:  http://localhost:8000/docs"
echo ""
echo -e "${BOLD}Test credentials:${NC}"
echo "  👤 Admin: admin@roadsafe.in  / Admin@123"
echo "  👤 User:  test@roadsafe.in   / Test@1234"
echo "  🚗 Plate: TS09EA1234"
echo ""
warn "Add your ANTHROPIC_API_KEY to .env for AI verification to work"
