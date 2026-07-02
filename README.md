# 🚨 RoadSafe Emergency Platform

**Reducing road accident response time from 30+ minutes to under 5 minutes.**

---

## The Problem We Solve

When a road accident happens:
- Bystanders don't know who to call
- Family is unaware and panicking
- Hospitals have no patient information
- Precious minutes are lost

**RoadSafe solves all of this in under 60 seconds.**

---

## How It Works

```
Vehicle owner registers → Gets QR sticker → Sticks on windshield

Accident happens:
Bystander scans QR (or enters plate number at emergency-lookup)
    ↓
GPS location captured automatically
    ↓
Bystander verifies their mobile number via OTP (⚡ THE authentication step —
no accident photo or selfie required, so nothing delays alerting the family)
    ↓ THE MOMENT OTP IS VERIFIED, SIMULTANEOUSLY:
    ├── Family alerted via SMS + WhatsApp + Email
    │   (victim name, vehicle, bystander name/phone, GPS, maps link, incident ID)
    ├── Emergency contact numbers revealed to the bystander (tap to call)
    ├── Medical passport revealed instantly (blood group, allergies, medications)
    ├── Nearby well-equipped hospitals shown, ranked by distance + quality
    │   (trauma centre / ICU / blood bank), each with ETA and navigation
    └── Incident ID + live tracking link generated

Family opens tracking link → Sees live location + hospital + bystander contact
Bystander can optionally attach a photo afterwards for police/insurance —
this never blocks or delays anything above.
```

### Why photos were removed from the critical path
The original flow required an accident photo (and optional selfie) before
anything happened. In a real accident, every second spent fumbling with a
camera is a second the family doesn't know. The bystander's verified mobile
number (OTP) plus their live GPS location is now the authentication —
faster, and it still gives full traceability (see "Misuse tracking" below).

### Misuse tracking
Every report stores the bystander's phone number, IP address, device ID, and
OTP-verification timestamp (`bystanderOtpVerifiedAt`) against the incident.
If the same phone/IP reports an unusual number of different vehicles in a
24-hour window, the event is automatically flagged
(`flaggedForAbuseReview` / `abuseReviewReason`) for admin review — so a QR
misused on someone else's vehicle can be traced back quickly without
slowing down genuine emergencies.

---

## ⚠️ Fixing "QR code only scans on my laptop, not on other phones"

This happens because the QR code encodes `APP_URL`, and `APP_URL` defaults
to `http://localhost:3000` — which only resolves on the machine that
generated it. A phone on the same Wi-Fi can't reach "localhost" on your
laptop; it needs your laptop's actual network address.

**Fix (local Wi-Fi testing):**
```bash
bash scripts/set-lan-url.sh
# Detects your LAN IP (e.g. 192.168.1.23) and updates:
#   .env               → APP_URL=http://192.168.1.23:3000
#   apps/web/.env.local → NEXT_PUBLIC_API_URL=http://192.168.1.23:3001
```
Then restart both dev servers and **regenerate QR codes** for any vehicles
created before this change (old QR images have the old URL baked in).
Your phone must be on the same Wi-Fi network as your computer.

**Fix (testing over mobile data / different networks):** use a tunnel —
`ngrok http 3000` and `ngrok http 3001` — and paste those `https://` URLs
into `APP_URL` / `NEXT_PUBLIC_API_URL` instead.

**Production:** set `APP_URL` to your real deployed domain (e.g.
`https://roadsafe.in`). This is a one-time deployment step, not something
users need to think about again once you're live.

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- Docker + Docker Compose
- Python 3.12+ (for AI service)

### Option A: Docker (Recommended — everything in one command)

```bash
git clone <repo>
cd roadsafe

# Copy env and add your Anthropic API key
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY=sk-ant-...

# Start everything
docker-compose up --build

# App: http://localhost:3000
# API: http://localhost:3001
# AI:  http://localhost:8000
```

### Option B: Manual (3 terminals)

```bash
# Terminal 0: Start database
docker-compose up postgres redis -d

# Setup (one time)
bash scripts/setup-dev.sh

# Terminal 1: API
cd services/api
npm run dev

# Terminal 2: AI Service
cd services/ai
uvicorn app.main:app --reload --port 8000

# Terminal 3: Frontend
cd apps/web
npm run dev
```

### Login
| Role  | Email                 | Password   |
|-------|-----------------------|------------|
| Admin | admin@roadsafe.in     | Admin@123  |
| User  | test@roadsafe.in      | Test@1234  |

Test vehicle: **TS09EA1234**

---

## Critical Emergency Workflow

### Path 1: QR Code (Primary)
```
http://localhost:3000/emergency/[qrToken]
```

### Path 2: Damaged/Missing QR (Backup — critical for real accidents)
```
http://localhost:3000/emergency-lookup
```
Enter vehicle number plate or registered mobile number. Same full emergency workflow.

### Family Tracking
```
http://localhost:3000/track/[shareToken]
```
Auto-sent to all emergency contacts via SMS. Live location, hospital, medical info.

### Medical Passport (for First Responders)
```
http://localhost:3000/emergency/[qrToken]/medical
```
Only accessible after AI verification. Shows blood group, allergies, medications.

---

## Project Structure

```
roadsafe/
├── apps/web/                    # Next.js 14 frontend
│   └── src/
│       ├── app/
│       │   ├── (auth)/          # Login, register, forgot password
│       │   ├── (dashboard)/     # Protected user pages
│       │   ├── emergency/       # QR scan flow + medical passport
│       │   ├── emergency-lookup/# Plate/mobile search fallback
│       │   ├── track/           # Family live tracking
│       │   ├── parking/         # Parking notification
│       │   └── page.tsx         # Landing page
│       ├── components/
│       │   ├── ui/              # Design system components
│       │   └── maps/            # Map components (OpenStreetMap)
│       ├── lib/api.ts           # All API calls
│       └── store/auth.ts        # Auth state (Zustand)
│
├── services/
│   ├── api/                     # Node.js + Express + TypeScript
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/        # Register, login, OTP, JWT
│   │       │   ├── emergency/   # Core emergency workflow
│   │       │   ├── vehicles/    # Vehicle + QR management
│   │       │   ├── profile/     # User profile + medical passport
│   │       │   ├── hospitals/   # Hospital search
│   │       │   ├── parking/     # Parking mode
│   │       │   └── admin/       # Admin dashboard
│   │       ├── middleware/      # Auth, validation, errors
│   │       ├── utils/           # SMS, email, storage, AI client
│   │       └── config/          # DB, Redis, env, logger
│   │
│   └── ai/                      # Python + FastAPI
│       └── app/routers/
│           ├── verify.py        # Accident verification (Claude Vision)
│           ├── severity.py      # Injury severity prediction
│           └── hospital.py      # Hospital recommendation
│
└── packages/database/           # Prisma schema + migrations
```

---

## API Routes

### Public (No auth — bystander use)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/emergency/scan/:qrToken | Verify QR code |
| POST | /api/emergency/lookup | Search by plate/mobile |
| POST | /api/emergency/otp/send | Send OTP to bystander mobile |
| POST | /api/emergency/otp/verify | Verify bystander OTP (the auth step) |
| POST | /api/emergency/start | Create emergency event (requires OTP-verified phone + GPS) |
| GET  | /api/emergency/:id/reveal | ⚡ Quick reveal — medical info + emergency contacts + nearby hospitals, one call |
| POST | /api/emergency/:id/evidence | OPTIONAL: attach photos afterwards (never blocks the reveal) |
| POST | /api/emergency/:id/location | Update live GPS |
| GET  | /api/emergency/:id/status | Get event status |
| GET  | /api/emergency/:id/status/stream | SSE real-time updates |
| GET  | /api/emergency/:id/medical | Medical passport (OTP-gated) |
| GET  | /api/emergency/:id/hospital | Best single hospital match |
| GET  | /api/emergency/track/:token | Family tracking data |

### Protected (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET  | /api/profile | Get profile + medical |
| PUT  | /api/profile | Update profile |
| GET  | /api/vehicles | List vehicles |
| POST | /api/vehicles/:id/generate-qr | Generate emergency QR |
| POST | /api/emergency/:id/ok | "I'm Safe" confirmation |

---

## Environment Variables

Copy `.env.example` to `.env`. Required for basic operation:

```env
# Required
DATABASE_URL=postgresql://roadsafe:roadsafe_dev_pwd@localhost:5432/roadsafe
JWT_SECRET=<32+ char secret>
JWT_REFRESH_SECRET=<32+ char secret>
QR_JWT_SECRET=<32+ char secret>

# Required for AI verification
ANTHROPIC_API_KEY=sk-ant-...

# Optional (work in mock/log mode without these)
TWILIO_ACCOUNT_SID=     # SMS + WhatsApp
SENDGRID_API_KEY=       # Email
AWS_ACCESS_KEY_ID=      # File storage (uses ./uploads/ without S3)
```

---

## External Services Needed for Production

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Anthropic API | AI accident verification | Pay per use |
| Twilio | SMS + WhatsApp alerts | Trial credits |
| SendGrid | Email notifications | 100 emails/day free |
| AWS S3 | Photo storage | 5GB free |
| Firebase FCM | Push notifications | Free |
| Google Maps | Navigation links | $200 credit/month |

---

## Security

- JWT access tokens (15 min) + refresh tokens (7 days, httpOnly cookie)
- bcrypt password hashing (rounds: 12)
- Rate limiting: 10 auth requests / 15 min per IP
- Brute force: 5 failed logins → 15 min lockout
- QR tokens: RS256 signed JWT, never expose personal data
- Bystander authentication: mobile number + OTP (6-digit, bcrypt-hashed,
  10-min expiry, 3 attempts max) + live GPS — required before any emergency
  info is revealed or any report is created
- Medical data + emergency contacts: only revealed after OTP verification
- All reveals/accesses: audit logged with phone, IP, device ID, and timestamp
  (`bystanderOtpVerifiedAt`) — enables tracing misuse after the fact
- Automatic misuse flagging: same phone/IP reporting many different vehicles
  in 24h is flagged (`flaggedForAbuseReview`) for admin review
- CORS: whitelist only
