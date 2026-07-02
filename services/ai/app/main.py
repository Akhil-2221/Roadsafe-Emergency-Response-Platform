from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging

from app.routers import verify, severity, hospital
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🤖 RoadSafe AI Service starting...")
    yield
    logger.info("AI Service shutting down")


app = FastAPI(
    title="RoadSafe AI Service",
    version="1.0.0",
    description="AI-powered accident verification, severity analysis, and hospital recommendation",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENV != "production" else None,
)


# ─── Service key auth middleware ─────────────────────────────────
@app.middleware("http")
async def verify_service_key(request: Request, call_next):
    if request.url.path in ["/health", "/docs", "/openapi.json"]:
        return await call_next(request)
    if settings.AI_SERVICE_KEY:
        key = request.headers.get("X-Service-Key")
        if key != settings.AI_SERVICE_KEY:
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


# ─── Routes ──────────────────────────────────────────────────────
app.include_router(verify.router, prefix="/ai", tags=["Accident Verification"])
app.include_router(severity.router, prefix="/ai", tags=["Severity Analysis"])
app.include_router(hospital.router, prefix="/ai", tags=["Hospital Recommendation"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "roadsafe-ai"}
