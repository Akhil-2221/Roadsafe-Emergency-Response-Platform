"""
RoadSafe AI Service Tests
Run: python -m pytest tests/ -v
"""
import pytest
import math
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Set test env before importing app
import os
os.environ["ANTHROPIC_API_KEY"] = "test_key_not_real"
os.environ["ENV"] = "test"

from app.main import app

client = TestClient(app)


# ─── Health check ─────────────────────────────────────────────────
def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "roadsafe-ai"


# ─── Accident Verification ────────────────────────────────────────
class TestVerifyAccident:

    PAYLOAD = {
        "event_id": "evt_test_001",
        "latitude": 17.4238,
        "longitude": 78.4569,
        "timestamp": "2025-01-01T10:00:00Z",
    }

    MOCK_CLAUDE_ACCIDENT = MagicMock()
    MOCK_CLAUDE_ACCIDENT.content = [
        MagicMock(text='{"verdict":"ACCIDENT","confidence":0.95,"reasoning":"Clear vehicle collision","visible_injuries":true,"vehicle_damage_visible":true}')
    ]

    MOCK_CLAUDE_FALSE_ALARM = MagicMock()
    MOCK_CLAUDE_FALSE_ALARM.content = [
        MagicMock(text='{"verdict":"FALSE_ALARM","confidence":0.88,"reasoning":"Normal parked car","visible_injuries":false,"vehicle_damage_visible":false}')
    ]

    def test_verify_accident_detected(self):
        with patch("app.routers.verify.client.messages.create", return_value=self.MOCK_CLAUDE_ACCIDENT):
            response = client.post("/ai/verify-accident", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert data["verdict"] == "ACCIDENT"
        assert data["confidence"] == 0.95
        assert data["visible_injuries"] is True
        assert "reasoning" in data

    def test_verify_false_alarm(self):
        with patch("app.routers.verify.client.messages.create", return_value=self.MOCK_CLAUDE_FALSE_ALARM):
            response = client.post("/ai/verify-accident", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert data["verdict"] == "FALSE_ALARM"
        assert data["confidence"] > 0.8

    def test_verify_defaults_to_possible_accident_on_bad_json(self):
        mock = MagicMock()
        mock.content = [MagicMock(text="This is not JSON at all")]
        with patch("app.routers.verify.client.messages.create", return_value=mock):
            response = client.post("/ai/verify-accident", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        # Must never block emergency response
        assert data["verdict"] == "POSSIBLE_ACCIDENT"
        assert data["confidence"] == 0.5

    def test_verify_confidence_clipped_to_valid_range(self):
        mock = MagicMock()
        mock.content = [MagicMock(text='{"verdict":"ACCIDENT","confidence":1.5,"reasoning":"Test","visible_injuries":false,"vehicle_damage_visible":false}')]
        with patch("app.routers.verify.client.messages.create", return_value=mock):
            response = client.post("/ai/verify-accident", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert data["confidence"] <= 1.0

    def test_verify_requires_event_id(self):
        bad_payload = {k: v for k, v in self.PAYLOAD.items() if k != "event_id"}
        response = client.post("/ai/verify-accident", json=bad_payload)
        assert response.status_code == 422  # Unprocessable entity


# ─── Severity Analysis ────────────────────────────────────────────
class TestSeverity:

    PAYLOAD = {
        "verdict": "ACCIDENT",
        "confidence": 0.92,
        "medical_profile": {
            "blood_group": "B+",
            "allergies": ["Penicillin"],
            "chronic_conditions": ["Hypertension"],
            "current_medications": ["Amlodipine 5mg"],
        },
    }

    def test_severity_critical(self):
        mock = MagicMock()
        mock.content = [MagicMock(text='{"severity":"CRITICAL","confidence":0.9,"explanation":"High speed collision","recommended_actions":["Call 112","Do not move victim"],"estimated_response_time_minutes":8}')]
        with patch("app.routers.severity.client.messages.create", return_value=mock):
            response = client.post("/ai/severity", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert data["severity"] == "CRITICAL"
        assert len(data["recommended_actions"]) > 0
        assert data["estimated_response_time_minutes"] > 0

    def test_severity_defaults_to_high_on_error(self):
        mock = MagicMock()
        mock.content = [MagicMock(text="invalid json")]
        with patch("app.routers.severity.client.messages.create", return_value=mock):
            response = client.post("/ai/severity", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert data["severity"] == "HIGH"  # Safe default

    def test_severity_valid_levels(self):
        for level in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
            mock = MagicMock()
            mock.content = [MagicMock(text=f'{{"severity":"{level}","confidence":0.8,"explanation":"Test","recommended_actions":["Act now"],"estimated_response_time_minutes":10}}')]
            with patch("app.routers.severity.client.messages.create", return_value=mock):
                response = client.post("/ai/severity", json=self.PAYLOAD)
            assert response.status_code == 200
            assert response.json()["severity"] == level


# ─── Hospital Recommendation ──────────────────────────────────────
class TestHospitalRecommendation:

    HOSPITALS = [
        {"id": "hosp_001", "name": "Yashoda Hospitals", "latitude": 17.4238, "longitude": 78.4569,
         "has_trauma_center": True, "has_blood_bank": True, "has_icu": True, "has_neurology": True},
        {"id": "hosp_002", "name": "KIMS Hospitals", "latitude": 17.4416, "longitude": 78.4977,
         "has_trauma_center": True, "has_blood_bank": True, "has_icu": True, "has_neurology": True},
        {"id": "hosp_003", "name": "Small Clinic", "latitude": 17.4300, "longitude": 78.4600,
         "has_trauma_center": False, "has_blood_bank": False, "has_icu": False, "has_neurology": False},
    ]

    PAYLOAD = {
        "latitude": 17.4200,
        "longitude": 78.4500,
        "severity": "CRITICAL",
        "medical_profile": {"blood_group": "O+", "conditions": []},
        "hospitals": HOSPITALS,
    }

    def test_recommends_hospital_with_trauma_for_critical(self):
        mock = MagicMock()
        mock.content = [MagicMock(text='{"hospital_id":"hosp_001","reasoning":"Closest trauma center for critical case"}')]
        with patch("app.routers.hospital.client.messages.create", return_value=mock):
            response = client.post("/ai/recommend-hospital", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert data["hospital_id"] in ["hosp_001", "hosp_002"]  # Must be trauma center
        assert data["eta_minutes"] > 0
        assert data["distance_km"] >= 0
        assert "reasoning" in data

    def test_fallback_to_nearest_on_bad_json(self):
        mock = MagicMock()
        mock.content = [MagicMock(text="not json")]
        with patch("app.routers.hospital.client.messages.create", return_value=mock):
            response = client.post("/ai/recommend-hospital", json=self.PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert data["hospital_id"] is not None

    def test_returns_400_with_no_hospitals(self):
        payload = {**self.PAYLOAD, "hospitals": []}
        response = client.post("/ai/recommend-hospital", json=payload)
        assert response.status_code == 400

    def test_distance_calculation_correct(self):
        """Yashoda (17.4238, 78.4569) from (17.4200, 78.4500) should be < 1km"""
        mock = MagicMock()
        mock.content = [MagicMock(text='{"hospital_id":"hosp_001","reasoning":"Nearest"}')]
        with patch("app.routers.hospital.client.messages.create", return_value=mock):
            response = client.post("/ai/recommend-hospital", json=self.PAYLOAD)
        data = response.json()
        assert data["distance_km"] < 2.0  # Should be well under 2km


# ─── Haversine math validation ────────────────────────────────────
def test_haversine_same_point():
    from app.routers.hospital import haversine_km
    assert haversine_km(17.4238, 78.4569, 17.4238, 78.4569) == pytest.approx(0, abs=0.001)

def test_haversine_known_distance():
    from app.routers.hospital import haversine_km
    # Hyderabad to Mumbai ≈ 710 km
    dist = haversine_km(17.3850, 78.4867, 19.0760, 72.8777)
    assert 680 < dist < 730
