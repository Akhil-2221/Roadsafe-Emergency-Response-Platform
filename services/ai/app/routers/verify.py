from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
import base64
import json
import logging
import anthropic

from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


class VerifyRequest(BaseModel):
    event_id: str
    accident_photo_url: Optional[str] = None
    accident_photo_base64: Optional[str] = None
    latitude: float
    longitude: float
    timestamp: Optional[str] = None
    bystander_description: Optional[str] = None


class VerifyResponse(BaseModel):
    verdict: str  # ACCIDENT | POSSIBLE_ACCIDENT | FALSE_ALARM
    confidence: float
    reasoning: str
    visible_injuries: bool
    vehicle_damage_visible: bool


async def fetch_image_as_base64(url: str) -> Optional[str]:
    """Download image from S3/URL and encode as base64."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            response = await http.get(url)
            response.raise_for_status()
            return base64.standard_b64encode(response.content).decode("utf-8")
    except Exception as e:
        logger.error(f"Failed to fetch image: {e}")
        return None


@router.post("/verify-accident", response_model=VerifyResponse)
async def verify_accident(req: VerifyRequest):
    """
    Analyze accident photo using Claude Vision to determine
    if a road accident has occurred.
    """
    logger.info(f"Verifying accident for event: {req.event_id}")

    # Build the image content block
    image_content = []

    if req.accident_photo_base64:
        image_content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": req.accident_photo_base64,
            },
        })
    elif req.accident_photo_url:
        b64 = await fetch_image_as_base64(req.accident_photo_url)
        if b64:
            image_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": b64,
                },
            })

    prompt_text = f"""You are an emergency accident verification system for RoadSafe Emergency platform.

Your task: Analyze the provided image and context to determine if a road accident has occurred.

Context:
- GPS coordinates: {req.latitude}, {req.longitude}
- Time: {req.timestamp or "Unknown"}
- Bystander description: {req.bystander_description or "None provided"}

{"This is the accident scene photo." if image_content else "No photo was provided — base your assessment on context only."}

Respond ONLY with a valid JSON object in this exact format, no other text:
{{
  "verdict": "ACCIDENT" | "POSSIBLE_ACCIDENT" | "FALSE_ALARM",
  "confidence": 0.0 to 1.0,
  "reasoning": "One sentence explaining your assessment",
  "visible_injuries": true | false,
  "vehicle_damage_visible": true | false
}}

Guidelines:
- ACCIDENT: Clear evidence of collision, vehicle damage, or injured people
- POSSIBLE_ACCIDENT: Ambiguous evidence — could be an accident or a breakdown
- FALSE_ALARM: Clearly not an accident (e.g., normal traffic, parked car)
- When in doubt, lean toward POSSIBLE_ACCIDENT (safe default)
- confidence 0.9+ means very certain, 0.5-0.7 means uncertain"""

    messages_content = image_content + [{"type": "text", "text": prompt_text}]

    try:
        response = client.messages.create(
            model=settings.MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": messages_content}],
        )

        raw = response.content[0].text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw.strip())

        # Validate verdict
        allowed = {"ACCIDENT", "POSSIBLE_ACCIDENT", "FALSE_ALARM"}
        if result.get("verdict") not in allowed:
            result["verdict"] = "POSSIBLE_ACCIDENT"

        confidence = float(result.get("confidence", 0.5))
        confidence = max(0.0, min(1.0, confidence))

        logger.info(f"Verdict: {result['verdict']} ({confidence:.2f}) for event {req.event_id}")

        return VerifyResponse(
            verdict=result["verdict"],
            confidence=confidence,
            reasoning=result.get("reasoning", "Analysis complete"),
            visible_injuries=bool(result.get("visible_injuries", False)),
            vehicle_damage_visible=bool(result.get("vehicle_damage_visible", False)),
        )

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}, raw: {raw}")
        # Safe default — don't block emergency response
        return VerifyResponse(
            verdict="POSSIBLE_ACCIDENT",
            confidence=0.5,
            reasoning="AI analysis inconclusive — treating as possible accident for safety",
            visible_injuries=False,
            vehicle_damage_visible=False,
        )
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")
