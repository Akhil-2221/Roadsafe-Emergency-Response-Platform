from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
import math
import logging
import anthropic

from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


class HospitalOption(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    has_trauma_center: bool = False
    has_blood_bank: bool = False
    has_icu: bool = True
    has_neurology: bool = False


class MedicalProfile(BaseModel):
    blood_group: Optional[str] = None
    conditions: Optional[List[str]] = []


class HospitalRequest(BaseModel):
    latitude: float
    longitude: float
    severity: str
    medical_profile: Optional[MedicalProfile] = None
    hospitals: List[HospitalOption]


class HospitalResponse(BaseModel):
    hospital_id: str
    hospital_name: str
    hospital_latitude: float
    hospital_longitude: float
    eta_minutes: int
    distance_km: float
    reasoning: str


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.post("/recommend-hospital", response_model=HospitalResponse)
async def recommend_hospital(req: HospitalRequest):
    if not req.hospitals:
        raise HTTPException(status_code=400, detail="No hospitals provided")

    # Add distance to each hospital
    hospitals_with_dist = []
    for h in req.hospitals:
        dist = haversine_km(req.latitude, req.longitude, h.latitude, h.longitude)
        # Estimated ETA: distance / avg speed 40km/h in city traffic
        eta = int((dist / 40) * 60)
        hospitals_with_dist.append({
            **h.dict(),
            "distance_km": round(dist, 2),
            "eta_minutes": eta,
        })

    # Sort by distance for context
    hospitals_with_dist.sort(key=lambda x: x["distance_km"])
    nearby = hospitals_with_dist[:5]  # Top 5 nearest

    hospital_list = "\n".join([
        f"- {h['name']}: {h['distance_km']}km away, ETA {h['eta_minutes']}min | "
        f"Trauma:{h['has_trauma_center']} ICU:{h['has_icu']} BloodBank:{h['has_blood_bank']} Neuro:{h['has_neurology']} | ID:{h['id']}"
        for h in nearby
    ])

    medical_context = ""
    if req.medical_profile:
        m = req.medical_profile
        if m.blood_group:
            medical_context += f"\nPatient blood group: {m.blood_group}"
        if m.conditions:
            medical_context += f"\nKnown conditions: {', '.join(m.conditions)}"

    prompt = f"""You are a hospital recommendation AI for RoadSafe Emergency platform.

Emergency situation:
- Severity: {req.severity}
- Incident location: {req.latitude}, {req.longitude}
{medical_context}

Available hospitals (within range):
{hospital_list}

Select the BEST hospital considering:
1. Severity match (CRITICAL needs trauma center + ICU)
2. Distance and ETA (closer is better, but capability matters more for CRITICAL)
3. Specific medical needs (blood group compatibility, conditions)

Respond ONLY with valid JSON:
{{
  "hospital_id": "exact hospital ID from the list",
  "reasoning": "One sentence explaining why this hospital was chosen"
}}"""

    try:
        response = client.messages.create(
            model=settings.MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw.strip())
        selected_id = result.get("hospital_id")

        # Find selected hospital
        selected = next((h for h in hospitals_with_dist if h["id"] == selected_id), None)

        if not selected:
            # Fallback: pick nearest with ICU
            selected = next((h for h in nearby if h["has_icu"]), nearby[0])
            result["reasoning"] = "Nearest hospital with ICU selected as fallback"

        return HospitalResponse(
            hospital_id=selected["id"],
            hospital_name=selected["name"],
            hospital_latitude=selected["latitude"],
            hospital_longitude=selected["longitude"],
            eta_minutes=selected["eta_minutes"],
            distance_km=selected["distance_km"],
            reasoning=result.get("reasoning", "Best available hospital selected"),
        )

    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Hospital recommendation error: {e}")
        # Fallback: nearest hospital
        selected = nearby[0]
        return HospitalResponse(
            hospital_id=selected["id"],
            hospital_name=selected["name"],
            hospital_latitude=selected["latitude"],
            hospital_longitude=selected["longitude"],
            eta_minutes=selected["eta_minutes"],
            distance_km=selected["distance_km"],
            reasoning="Nearest hospital selected",
        )
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error: {e}")
        raise HTTPException(status_code=503, detail="AI service unavailable")
