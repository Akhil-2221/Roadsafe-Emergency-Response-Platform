from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
import logging
import anthropic

from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


class MedicalProfile(BaseModel):
    blood_group: Optional[str] = None
    allergies: Optional[List[str]] = []
    chronic_conditions: Optional[List[str]] = []
    current_medications: Optional[List[str]] = []


class SeverityRequest(BaseModel):
    verdict: str
    confidence: float
    accident_photo_url: Optional[str] = None
    medical_profile: Optional[MedicalProfile] = None


class SeverityResponse(BaseModel):
    severity: str  # LOW | MEDIUM | HIGH | CRITICAL
    confidence: float
    explanation: str
    recommended_actions: List[str]
    estimated_response_time_minutes: int


@router.post("/severity", response_model=SeverityResponse)
async def analyze_severity(req: SeverityRequest):
    logger.info(f"Analyzing severity for verdict: {req.verdict}")

    medical_context = ""
    if req.medical_profile:
        m = req.medical_profile
        parts = []
        if m.blood_group:
            parts.append(f"Blood group: {m.blood_group}")
        if m.allergies:
            parts.append(f"Allergies: {', '.join(m.allergies)}")
        if m.chronic_conditions:
            parts.append(f"Conditions: {', '.join(m.chronic_conditions)}")
        if m.current_medications:
            parts.append(f"Medications: {', '.join(m.current_medications)}")
        medical_context = "\n".join(parts)

    prompt = f"""You are an emergency medical severity assessment AI for RoadSafe Emergency.

Accident Information:
- Verification verdict: {req.verdict}
- AI confidence in accident: {req.confidence:.0%}
{f"Medical profile of victim:{chr(10)}{medical_context}" if medical_context else "- No medical profile available"}

Based on this information, assess the severity level and recommended emergency actions.

Respond ONLY with valid JSON in this exact format:
{{
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "confidence": 0.0 to 1.0,
  "explanation": "One sentence explaining severity assessment",
  "recommended_actions": ["action 1", "action 2", "action 3"],
  "estimated_response_time_minutes": integer (ideal ambulance response time)
}}

Severity guidelines:
- LOW: Minor incident, victim likely conscious and mobile
- MEDIUM: Moderate injuries, medical attention needed but not life-threatening
- HIGH: Serious injuries, immediate medical attention critical
- CRITICAL: Life-threatening, requires immediate intervention

Recommended actions should be practical instructions for bystanders (e.g., "Do not move the victim", "Apply pressure to wounds", "Keep victim warm and still")."""

    try:
        response = client.messages.create(
            model=settings.MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw.strip())

        allowed = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        if result.get("severity") not in allowed:
            result["severity"] = "HIGH"

        return SeverityResponse(
            severity=result["severity"],
            confidence=float(result.get("confidence", 0.7)),
            explanation=result.get("explanation", "Severity assessed based on available information"),
            recommended_actions=result.get("recommended_actions", [
                "Do not move the victim unless in immediate danger",
                "Call 112 immediately",
                "Keep the victim warm and still",
            ]),
            estimated_response_time_minutes=int(result.get("estimated_response_time_minutes", 10)),
        )

    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Severity parsing error: {e}")
        return SeverityResponse(
            severity="HIGH",
            confidence=0.5,
            explanation="Defaulting to HIGH severity for safety",
            recommended_actions=["Call 112 immediately", "Do not move the victim", "Stay with the victim"],
            estimated_response_time_minutes=10,
        )
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error: {e}")
        raise HTTPException(status_code=503, detail="AI service unavailable")
