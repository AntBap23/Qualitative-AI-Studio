from collections import defaultdict, deque
from pathlib import Path
import time
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.auth import (
    get_auth_context_from_access_token,
    get_optional_auth_context,
    require_authenticated_user,
    sign_in_with_password,
    sign_up_with_password,
    sign_out_with_token,
)
from backend.errors import AuthenticationError, SupabaseOperationError
from backend.schemas import (
    AuthSessionResponse,
    AuthSignInRequest,
    AuthSignUpRequest,
    AuthUserResponse,
    ComparisonRequest,
    ComparisonResponse,
    GioiaAnalysisRequest,
    GioiaAnalysisResponse,
    HealthResponse,
    StudyCreate,
    StudyRecord,
    PersonaCreate,
    PersonaExtractRequest,
    PersonaRecord,
    QuestionExtractRequest,
    QuestionGuideCreate,
    QuestionGuideRecord,
    SimulationRequest,
    SimulationResponse,
    StudyProtocol,
    StudyProtocolCreate,
    SupportTicketCreate,
    SupportTicketRecord,
    TranscriptCreate,
    TranscriptRecord,
    UploadTextResponse,
    UserDataConsentResponse,
    UserDataConsentUpdateRequest,
)
from backend.services import ResearchBackendService
from backend.settings import settings
from backend.storage import get_storage


app = FastAPI(title=settings.api_title, version=settings.api_version)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_service_singleton = ResearchBackendService(get_storage())


def get_service() -> ResearchBackendService:
    return _service_singleton


frontend_dir = Path("frontend")
if frontend_dir.exists():
    app.mount("/frontend", StaticFiles(directory=str(frontend_dir)), name="frontend")


def serve_frontend_page(filename: str):
    page_path = frontend_dir / filename
    if not page_path.exists():
        raise HTTPException(status_code=404, detail="Frontend page not found.")
    return FileResponse(page_path)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", storage_backend=settings.storage_backend)


PUBLIC_PAGE_ROUTES = {"/", "/sign-in"}
FRONTEND_PAGE_ROUTES = {
    "/": "index.html",
    "/dashboard": "dashboard.html",
    "/support": "support.html",
    "/studies": "studies.html",
    "/workspace": "workspace.html",
    "/protocol": "protocol.html",
    "/personas": "personas.html",
    "/interview-guide": "interview-guide.html",
    "/transcripts": "transcripts.html",
    "/simulations": "simulations.html",
    "/comparisons": "comparisons.html",
    "/settings": "settings.html",
    "/sign-in": "sign-in.html",
}
PROTECTED_PAGE_ROUTES = set(FRONTEND_PAGE_ROUTES.keys()) - PUBLIC_PAGE_ROUTES
NO_CACHE_PATHS = {"/", *FRONTEND_PAGE_ROUTES.keys()}
NO_CACHE_API_PREFIXES = ("/api/auth",)
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
AUTH_RATE_LIMIT_BUCKETS: defaultdict[str, deque[float]] = defaultdict(deque)
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "application/octet-stream",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
    "text/plain",
}


def _normalized_origin(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _allowed_origins_for_request(request: Request) -> set[str]:
    origins = {origin.rstrip("/") for origin in settings.cors_origin_list}
    origins.add(str(request.base_url).rstrip("/"))
    return origins


def _request_origin(request: Request) -> str | None:
    origin = _normalized_origin(request.headers.get("Origin"))
    if origin:
        return origin
    return _normalized_origin(request.headers.get("Referer"))


def _enforce_trusted_origin(request: Request) -> None:
    if request.method.upper() not in UNSAFE_METHODS:
        return
    if not request.url.path.startswith("/api"):
        return

    origin = _request_origin(request)
    if origin and origin not in _allowed_origins_for_request(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-site requests are not allowed.")


def _security_headers_for_path(path: str) -> dict[str, str]:
    headers = {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
    }
    if path not in {"/docs", "/redoc", "/openapi.json"}:
        headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "base-uri 'self'; "
            "connect-src 'self'; "
            "font-src 'self' https://fonts.gstatic.com; "
            "form-action 'self'; "
            "frame-ancestors 'none'; "
            "img-src 'self' data:; "
            "media-src 'self' blob:; "
            "object-src 'none'; "
            "script-src 'self'; "
            "style-src 'self' https://fonts.googleapis.com"
        )
    return headers


def _apply_security_headers(request: Request, response: Response) -> None:
    for key, value in _security_headers_for_path(request.url.path).items():
        response.headers.setdefault(key, value)
    if request.headers.get("X-Forwarded-Proto", request.url.scheme).lower() == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")


def _apply_no_cache_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"


def _client_identifier(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def _auth_rate_limit_key(request: Request, email: str) -> str:
    return f"{request.url.path}:{_client_identifier(request)}:{email.strip().lower()}"


def _prune_auth_rate_limit_bucket(bucket: deque[float], now: float) -> None:
    window = settings.auth_rate_limit_window_seconds
    while bucket and now - bucket[0] >= window:
        bucket.popleft()


def _enforce_auth_rate_limit(key: str) -> None:
    now = time.time()
    bucket = AUTH_RATE_LIMIT_BUCKETS[key]
    _prune_auth_rate_limit_bucket(bucket, now)
    if len(bucket) >= settings.auth_rate_limit_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Please wait a few minutes and try again.",
        )


def _record_auth_failure(key: str) -> None:
    now = time.time()
    bucket = AUTH_RATE_LIMIT_BUCKETS[key]
    _prune_auth_rate_limit_bucket(bucket, now)
    bucket.append(now)


def _clear_auth_failures(key: str) -> None:
    AUTH_RATE_LIMIT_BUCKETS.pop(key, None)


def _validate_upload_file(file: UploadFile) -> None:
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in settings.allowed_upload_extension_set:
        allowed = ", ".join(sorted(settings.allowed_upload_extension_set))
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type. Allowed extensions: {allowed}.",
        )

    content_type = (file.content_type or "").lower()
    if content_type and not (content_type in ALLOWED_UPLOAD_CONTENT_TYPES or content_type.startswith("text/")):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported upload content type.",
        )


async def _read_validated_upload_bytes(file: UploadFile) -> bytes:
    _validate_upload_file(file)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded file exceeds the {settings.max_upload_bytes} byte limit.",
        )
    return content


def _set_session_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    secure = settings.auth_cookie_secure
    samesite = settings.auth_cookie_samesite.lower()
    response.set_cookie(
        key=settings.auth_access_cookie_name,
        value=access_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        key=settings.auth_refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(settings.auth_access_cookie_name, path="/")
    response.delete_cookie(settings.auth_refresh_cookie_name, path="/")


def _apply_refreshed_session_cookies(request: Request, response: Response) -> None:
    refreshed_access = getattr(request.state, "refreshed_access_token", None)
    refreshed_refresh = getattr(request.state, "refreshed_refresh_token", None)
    if refreshed_access and refreshed_refresh:
        _set_session_cookies(response, refreshed_access, refreshed_refresh)


@app.exception_handler(SupabaseOperationError)
async def handle_supabase_operation_error(_: Request, exc: SupabaseOperationError):
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={"detail": str(exc)},
    )


@app.exception_handler(AuthenticationError)
async def handle_authentication_error(_: Request, exc: AuthenticationError):
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": str(exc)},
    )


@app.middleware("http")
async def enforce_authentication(request: Request, call_next):
    path = request.url.path

    if path.startswith("/frontend") or path == "/health" or path == "/favicon.ico":
        response = await call_next(request)
        _apply_security_headers(request, response)
        if path.startswith("/frontend/"):
            _apply_no_cache_headers(response)
        return response

    try:
        _enforce_trusted_origin(request)
    except HTTPException as exc:
        response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        _apply_security_headers(request, response)
        return response

    if path in PROTECTED_PAGE_ROUTES and get_optional_auth_context(request) is None:
        response = RedirectResponse(url="/sign-in", status_code=status.HTTP_303_SEE_OTHER)
        _apply_security_headers(request, response)
        _apply_no_cache_headers(response)
        return response

    if path.startswith("/api") and not path.startswith("/api/auth"):
        try:
            require_authenticated_user(request)
        except HTTPException as exc:
            response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
            _apply_security_headers(request, response)
            return response

    response = await call_next(request)
    _apply_refreshed_session_cookies(request, response)
    _apply_security_headers(request, response)
    if path in NO_CACHE_PATHS or path.startswith("/frontend/") or path.startswith(NO_CACHE_API_PREFIXES):
        _apply_no_cache_headers(response)
    return response


def _make_frontend_page_handler(filename: str):
    def endpoint():
        return serve_frontend_page(filename)

    return endpoint


for route_path, filename in FRONTEND_PAGE_ROUTES.items():
    app.add_api_route(route_path, _make_frontend_page_handler(filename), include_in_schema=False)


@app.post("/api/auth/sign-in", response_model=AuthSessionResponse)
def sign_in(payload: AuthSignInRequest, request: Request):
    rate_limit_key = _auth_rate_limit_key(request, payload.email)
    _enforce_auth_rate_limit(rate_limit_key)
    try:
        access_token, refresh_token = sign_in_with_password(payload.email, payload.password)
    except AuthenticationError:
        _record_auth_failure(rate_limit_key)
        raise

    _clear_auth_failures(rate_limit_key)
    context = get_auth_context_from_access_token(access_token)

    response = JSONResponse(
        content={
            "authenticated": True,
            "user": {"id": context.user_id, "email": context.email, "role": context.role},
        }
    )
    _set_session_cookies(response, access_token, refresh_token)
    return response


@app.post("/api/auth/sign-up", response_model=AuthSessionResponse)
def sign_up(payload: AuthSignUpRequest, request: Request):
    rate_limit_key = _auth_rate_limit_key(request, payload.email)
    _enforce_auth_rate_limit(rate_limit_key)
    try:
        access_token, refresh_token, user = sign_up_with_password(payload.email, payload.password)
    except AuthenticationError:
        _record_auth_failure(rate_limit_key)
        raise

    _clear_auth_failures(rate_limit_key)

    user_id = str(getattr(user, "id", "") or "")
    email = getattr(user, "email", None)
    role = None
    app_metadata = getattr(user, "app_metadata", None)
    if isinstance(app_metadata, dict) and app_metadata.get("role"):
        role = str(app_metadata["role"])

    if access_token and refresh_token:
        context = get_auth_context_from_access_token(access_token)
        response = JSONResponse(
            content={
                "authenticated": True,
                "user": {"id": context.user_id, "email": context.email, "role": context.role},
                "message": "Account created and signed in.",
            }
        )
        _set_session_cookies(response, access_token, refresh_token)
        return response

    return AuthSessionResponse(
        authenticated=False,
        user=AuthUserResponse(id=user_id, email=email, role=role),
        message="Account created. Check your email to confirm your account before signing in.",
    )


@app.post("/api/auth/sign-out", response_model=AuthSessionResponse)
def sign_out(request: Request):
    context = get_optional_auth_context(request)
    sign_out_with_token(context.access_token if context else None)

    response = JSONResponse(content={"authenticated": False, "user": None})
    _clear_session_cookies(response)
    return response


@app.get("/api/auth/session", response_model=AuthSessionResponse)
def auth_session(request: Request, response: Response):
    context = get_optional_auth_context(request)
    _apply_refreshed_session_cookies(request, response)
    if context is None:
        return AuthSessionResponse(authenticated=False, user=None)
    return AuthSessionResponse(
        authenticated=True,
        user=AuthUserResponse(id=context.user_id, email=context.email, role=context.role),
    )


@app.get("/api/privacy-consent", response_model=UserDataConsentResponse)
def get_privacy_consent(request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.get_user_data_consent(context.user_id)


@app.put("/api/privacy-consent", response_model=UserDataConsentResponse)
def update_privacy_consent(
    payload: UserDataConsentUpdateRequest, request: Request, service: ResearchBackendService = Depends(get_service)
):
    context = require_authenticated_user(request)
    return service.set_user_data_consent(context.user_id, payload.status)


@app.get("/api/studies", response_model=list[StudyRecord])
def list_studies(request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.list_collection("studies", context.user_id)


@app.post("/api/studies", response_model=StudyRecord)
def create_study(payload: StudyCreate, request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.save_study(payload.model_dump(), context.user_id)


@app.get("/api/protocols", response_model=list[StudyProtocol])
def list_protocols(request: Request, study_id: str | None = None, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.list_collection("protocols", context.user_id, study_id=study_id)


@app.post("/api/protocols", response_model=StudyProtocol)
def create_protocol(payload: StudyProtocolCreate, request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.save_protocol(payload.model_dump(), context.user_id)


@app.get("/api/personas", response_model=list[PersonaRecord])
def list_personas(request: Request, study_id: str | None = None, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.list_collection("personas", context.user_id, study_id=study_id)


@app.post("/api/personas", response_model=PersonaRecord)
def create_persona(payload: PersonaCreate, request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.save_persona(payload.model_dump(), context.user_id)


@app.post("/api/personas/extract", response_model=PersonaRecord)
def extract_persona(payload: PersonaExtractRequest, request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    persona = service.extract_persona(payload.text, context.user_id, payload.suggested_name)
    return service.save_persona(persona, context.user_id)


@app.post("/api/personas/extract-upload", response_model=UploadTextResponse)
async def extract_persona_upload(file: UploadFile = File(...), service: ResearchBackendService = Depends(get_service)):
    content = await _read_validated_upload_bytes(file)
    try:
        text = service.extract_persona_text_from_upload(file.filename or "upload", file.content_type or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UploadTextResponse(text=text)


@app.post("/api/question-guides/extract", response_model=list[str])
def extract_questions(payload: QuestionExtractRequest, service: ResearchBackendService = Depends(get_service)):
    return service.extract_questions(payload.text, payload.improve_with_ai)


@app.post("/api/question-guides/extract-upload", response_model=UploadTextResponse)
async def extract_questions_upload(file: UploadFile = File(...), service: ResearchBackendService = Depends(get_service)):
    content = await _read_validated_upload_bytes(file)
    try:
        text = service.extract_text_from_upload(file.filename or "upload", file.content_type or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UploadTextResponse(text=text)


@app.post("/api/protocols/extract-upload", response_model=UploadTextResponse)
async def extract_protocol_upload(file: UploadFile = File(...), service: ResearchBackendService = Depends(get_service)):
    content = await _read_validated_upload_bytes(file)
    try:
        text = service.extract_text_from_upload(file.filename or "upload", file.content_type or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UploadTextResponse(text=text)


@app.post("/api/question-guides", response_model=QuestionGuideRecord)
def create_question_guide(payload: QuestionGuideCreate, request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.save_question_guide(payload.name, payload.questions, context.user_id, payload.study_id)


@app.get("/api/question-guides", response_model=list[QuestionGuideRecord])
def list_question_guides(
    request: Request, study_id: str | None = None, service: ResearchBackendService = Depends(get_service)
):
    context = require_authenticated_user(request)
    return service.list_collection("question_guides", context.user_id, study_id=study_id)


@app.post("/api/transcripts", response_model=TranscriptRecord)
def create_transcript(payload: TranscriptCreate, request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.save_transcript(payload.name, payload.content, context.user_id, payload.source_type, payload.study_id)


@app.post("/api/transcripts/extract-upload", response_model=UploadTextResponse)
async def extract_transcript_upload(file: UploadFile = File(...), service: ResearchBackendService = Depends(get_service)):
    content = await _read_validated_upload_bytes(file)
    try:
        text = service.extract_text_from_upload(file.filename or "upload", file.content_type or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UploadTextResponse(text=text)


@app.get("/api/transcripts", response_model=list[TranscriptRecord])
def list_transcripts(request: Request, study_id: str | None = None, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.list_collection("transcripts", context.user_id, study_id=study_id)


@app.post("/api/simulations", response_model=SimulationResponse)
def create_simulation(payload: SimulationRequest, request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    try:
        return service.run_simulation(
            payload.persona_id,
            payload.question_guide_id,
            context.user_id,
            payload.protocol_id,
            payload.study_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/simulations", response_model=list[SimulationResponse])
def list_simulations(request: Request, study_id: str | None = None, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.list_collection("simulations", context.user_id, study_id=study_id)


@app.post("/api/analyses/gioia", response_model=GioiaAnalysisResponse)
def create_gioia_analysis(
    payload: GioiaAnalysisRequest, request: Request, service: ResearchBackendService = Depends(get_service)
):
    context = require_authenticated_user(request)
    try:
        return service.run_ai_gioia(payload.simulation_id, context.user_id, payload.protocol_id, payload.study_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/analyses/gioia", response_model=list[GioiaAnalysisResponse])
def list_gioia_analyses(
    request: Request, study_id: str | None = None, service: ResearchBackendService = Depends(get_service)
):
    context = require_authenticated_user(request)
    return service.list_collection("gioia_analyses", context.user_id, study_id=study_id)


@app.post("/api/comparisons", response_model=ComparisonResponse)
def create_comparison(payload: ComparisonRequest, request: Request, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    try:
        return service.run_structured_comparison(
            payload.transcript_id,
            payload.simulation_id,
            context.user_id,
            payload.protocol_id,
            payload.study_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/comparisons", response_model=list[ComparisonResponse])
def list_comparisons(request: Request, study_id: str | None = None, service: ResearchBackendService = Depends(get_service)):
    context = require_authenticated_user(request)
    return service.list_collection("comparisons", context.user_id, study_id=study_id)


@app.get("/api/support-tickets", response_model=list[SupportTicketRecord])
def list_support_tickets(
    request: Request, study_id: str | None = None, service: ResearchBackendService = Depends(get_service)
):
    context = require_authenticated_user(request)
    return service.list_support_tickets(context.user_id, study_id=study_id)


@app.post("/api/support-tickets", response_model=SupportTicketRecord)
def create_support_ticket(
    payload: SupportTicketCreate, request: Request, service: ResearchBackendService = Depends(get_service)
):
    context = require_authenticated_user(request)
    return service.save_support_ticket(payload.model_dump(), context.user_id)


@app.get("/api/simulations/{simulation_id}/exports/{file_type}")
def export_simulation(
    simulation_id: str, file_type: str, request: Request, service: ResearchBackendService = Depends(get_service)
):
    context = require_authenticated_user(request)
    try:
        export_path = service.export_simulation(simulation_id, context.user_id, file_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    file_path = Path(export_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Export file not found.")
    return FileResponse(file_path, filename=file_path.name)
