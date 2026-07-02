#!/bin/bash
set -e

BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BOLD}🚨 RoadSafe Emergency — Development Setup${NC}"
echo "================================================"

# ─── Check prerequisites ─────────────────────────────────────────
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

check_cmd() {
  if command -v "$1" &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} $1"
  else
    echo -e "  ${RED}✗${NC} $1 — REQUIRED. Please install it."
    exit 1
  fi
}

check_cmd node
check_cmd npm
check_cmd docker
check_cmd python3
check_cmd pip3

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}✗ Node.js 18+ required. Got $(node -v)${NC}"
  exit 1
fi

# ─── Environment file ────────────────────────────────────────────
echo -e "\n${YELLOW}Setting up environment...${NC}"
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "  ${GREEN}✓${NC} .env created from .env.example"
  echo -e "  ${YELLOW}⚠ IMPORTANT: Edit .env and add your ANTHROPIC_API_KEY${NC}"
  echo -e "  ${YELLOW}  Also generate JWT secrets: openssl rand -hex 32${NC}"
else
  echo -e "  ${GREEN}✓${NC} .env already exists"
fi

# ─── Generate secrets if defaults present ────────────────────────
if grep -q "REPLACE_WITH_openssl" .env; then
  echo -e "\n${YELLOW}Auto-generating secrets...${NC}"
  
  # Generate and replace each secret
  JWT_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH=$(openssl rand -hex 32)
  QR_SECRET=$(openssl rand -hex 32)
  COOKIE_SECRET=$(openssl rand -hex 32)
  
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|REPLACE_WITH_openssl_rand_hex_32_output_here|${JWT_SECRET}|" .env
    sed -i '' "s|REPLACE_WITH_ANOTHER_openssl_rand_hex_32_here|${JWT_REFRESH}|" .env
    sed -i '' "s|REPLACE_WITH_openssl_rand_hex_32_for_qr|${QR_SECRET}|" .env
    sed -i '' "s|REPLACE_WITH_openssl_rand_hex_32_for_cookies|${COOKIE_SECRET}|" .env
  else
    sed -i "s|REPLACE_WITH_openssl_rand_hex_32_output_here|${JWT_SECRET}|" .env
    sed -i "s|REPLACE_WITH_ANOTHER_openssl_rand_hex_32_here|${JWT_REFRESH}|" .env
    sed -i "s|REPLACE_WITH_openssl_rand_hex_32_for_qr|${QR_SECRET}|" .env
    sed -i "s|REPLACE_WITH_openssl_rand_hex_32_for_cookies|${COOKIE_SECRET}|" .env
  fi
  echo -e "  ${GREEN}✓${NC} Secrets generated"
fi

# ─── Start infrastructure ─────────────────────────────────────────
echo -e "\n${YELLOW}Starting PostgreSQL and Redis...${NC}"
docker-compose up postgres redis -d --wait 2>/dev/null || docker-compose up postgres redis -d
sleep 3
echo -e "  ${GREEN}✓${NC} Infrastructure running"

# ─── Install backend deps ─────────────────────────────────────────
echo -e "\n${YELLOW}Installing API dependencies...${NC}"
cd services/api && npm install && cd ../..
echo -e "  ${GREEN}✓${NC} API dependencies installed"

# ─── Database setup ───────────────────────────────────────────────
echo -e "\n${YELLOW}Setting up database...${NC}"
cd packages/database

if [ ! -f "node_modules/.bin/prisma" ]; then
  npm install
fi

# Load DATABASE_URL from .env
export $(grep -E "^DATABASE_URL=" ../../.env | xargs)

npx prisma generate
npx prisma migrate deploy 2>/dev/null || npx prisma db push --force-reset
npx ts-node prisma/seed.ts
cd ../..
echo -e "  ${GREEN}✓${NC} Database migrated and seeded"

# ─── Install AI deps ──────────────────────────────────────────────
echo -e "\n${YELLOW}Installing AI service dependencies...${NC}"
cd services/ai && pip3 install -r requirements.txt -q && cd ../..
echo -e "  ${GREEN}✓${NC} AI dependencies installed"

# ─── Install frontend deps ────────────────────────────────────────
echo -e "\n${YELLOW}Installing web app dependencies...${NC}"
cd apps/web && npm install && cd ../..
echo -e "  ${GREEN}✓${NC} Web app dependencies installed"

echo ""
echo -e "${GREEN}${BOLD}✅ Setup complete!${NC}"
echo ""
echo "Start all services:"
echo -e "  ${BOLD}Terminal 1 (API):${NC}   cd services/api && npm run dev"
echo -e "  ${BOLD}Terminal 2 (AI):${NC}    cd services/ai && uvicorn app.main:app --reload --port 8000"
echo -e "  ${BOLD}Terminal 3 (Web):${NC}   cd apps/web && npm run dev"
echo ""
echo "Or start everything with Docker:"
echo -e "  ${BOLD}docker-compose up --build${NC}"
echo ""
echo "Test accounts:"
echo -e "  Admin: ${BOLD}admin@roadsafe.in${NC} / Admin@123"
echo -e "  User:  ${BOLD}test@roadsafe.in${NC} / Test@1234"
echo ""
