from datetime import datetime
from typing import Literal
from typing import Any

from pydantic import BaseModel, Field, field_validator


class StudyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: str = ""


class StudyCreate(StudyBase):
    pass


class StudyRecord(StudyBase):
    id: str
    created_at: datetime
    updated_at: datetime


class StudyProtocolBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    shared_context: str = ""
    interview_style_guidance: str = ""
    consistency_rules: str = ""
    analysis_focus: str = ""


class StudyProtocolCreate(StudyProtocolBase):
    study_id: str | None = None
    pass


class StudyProtocol(StudyProtocolBase):
    id: str
    study_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PersonaBase(BaseModel):
    name: str
    age: int | None = None
    job: str = "Professional"
    education: str = "Not specified"
    personality: str = "Not specified"
    original_text: str = ""
    opinions: dict[str, str] = Field(default_factory=dict)


class PersonaCreate(PersonaBase):
    study_id: str | None = None
    pass


class PersonaExtractRequest(BaseModel):
    text: str
    suggested_name: str | None = None


class PersonaRecord(PersonaBase):
    id: str
    study_id: str | None = None
    created_at: datetime
    updated_at: datetime


class QuestionExtractRequest(BaseModel):
    text: str
    improve_with_ai: bool = False


class QuestionGuideCreate(BaseModel):
    name: str
    questions: list[str]
    study_id: str | None = None


class QuestionGuideRecord(BaseModel):
    id: str
    name: str
    questions: list[str]
    study_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TranscriptCreate(BaseModel):
    name: str
    content: str
    source_type: str = "text"
    study_id: str | None = None


class TranscriptRecord(BaseModel):
    id: str
    name: str
    content: str
    source_type: str = "text"
    study_id: str | None = None
    created_at: datetime
    updated_at: datetime


class SimulationRequest(BaseModel):
    persona_id: str
    question_guide_id: str
    protocol_id: str | None = None
    study_id: str | None = None


class SimulationResponse(BaseModel):
    id: str
    persona_id: str
    question_guide_id: str
    protocol_id: str | None = None
    study_id: str | None = None
    responses: list[dict[str, Any]]
    created_at: datetime


class GioiaAnalysisRequest(BaseModel):
    simulation_id: str
    protocol_id: str | None = None
    study_id: str | None = None


class GioiaAnalysisResponse(BaseModel):
    id: str
    simulation_id: str
    protocol_id: str | None = None
    study_id: str | None = None
    markdown: str
    created_at: datetime


class ComparisonRequest(BaseModel):
    transcript_id: str
    simulation_id: str
    protocol_id: str | None = None
    study_id: str | None = None


class ComparisonResponse(BaseModel):
    id: str
    transcript_id: str
    simulation_id: str
    protocol_id: str | None = None
    study_id: str | None = None
    payload: dict[str, Any]
    created_at: datetime


class UploadTextResponse(BaseModel):
    text: str


class HealthResponse(BaseModel):
    status: str
    storage_backend: str


class AuthCredentialsBase(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise ValueError("Enter a valid email address.")
        return email


class AuthSignInRequest(AuthCredentialsBase):
    password: str


class AuthSignUpRequest(AuthCredentialsBase):
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        password = value or ""
        if len(password) < 12:
            raise ValueError("Password must be at least 12 characters.")
        if password.strip() != password:
            raise ValueError("Password cannot start or end with spaces.")
        return password


class AuthUserResponse(BaseModel):
    id: str
    email: str | None = None
    role: str | None = None


class AuthSessionResponse(BaseModel):
    authenticated: bool
    user: AuthUserResponse | None = None
    message: str | None = None


class UserDataConsentUpdateRequest(BaseModel):
    status: Literal["accepted", "declined"]


class UserDataConsentResponse(BaseModel):
    status: Literal["pending", "accepted", "declined"]
    allows_analytics: bool
    consented_at: datetime | None = None
    updated_at: datetime | None = None
