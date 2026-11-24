"""Authenticated Studio-to-support-desk connection. No credentials reach the browser."""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request as URLRequest, urlopen
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.auth import require_authenticated_user
from backend.settings import settings

router = APIRouter(prefix="/api/support-chat", tags=["customer support"])


class ChatMessage(BaseModel):
    conversation_id: UUID
    request_id: UUID = Field(default_factory=uuid4)
    message: str = Field(min_length=1, max_length=6000)
    create_ticket: bool = False


def configured() -> bool:
    return bool(settings.customer_agent_url and settings.customer_agent_bridge_secret)


def relay(request: Request, method: str, path: str, payload: dict | None = None):
    context = require_authenticated_user(request)
    if not configured():
        raise HTTPException(503, "Live chat is not available yet. You can still submit a support request on the Support page.")
    if not settings.customer_agent_url.startswith("https://"):
        raise HTTPException(503, "Live chat connection is unavailable.")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Studio-Bridge-Secret": settings.customer_agent_bridge_secret,
        "X-Studio-Customer-ID": context.user_id,
    }
    # Keep compatibility during cutover; Workers needs only the bridge secret.
    if settings.customer_agent_access_token:
        headers["OAI-Sites-Authorization"] = "Bearer " + settings.customer_agent_access_token
    upstream = URLRequest(
        settings.customer_agent_url.rstrip("/") + "/api/bridge/" + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers=headers,
    )
    try:
        with urlopen(upstream, timeout=60) as response:
            content = response.read(2 * 1024 * 1024 + 1)
            if len(content) > 2 * 1024 * 1024:
                raise ValueError("Oversized response")
            return json.loads(content)
    except HTTPError as exc:
        if exc.code in {404, 409, 422, 429}:
            messages = {404: "Conversation or ticket not found.", 409: "This conversation changed or the message is still processing. Reload it before retrying.", 422: "Check your message and try again.", 429: "Please wait a minute before sending more messages."}
            raise HTTPException(exc.code, messages[exc.code]) from None
        raise HTTPException(503, "The support assistant is temporarily unavailable. Please try again or use the Support page.") from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise HTTPException(503, "The support assistant is temporarily unavailable. Please try again or use the Support page.") from None


@router.get("/status")
def chat_status(request: Request):
    require_authenticated_user(request)
    return {"available": configured()}


@router.post("/conversations")
def create_conversation(request: Request):
    return relay(request, "POST", "conversations", {})


@router.get("/conversations/{conversation_id}")
def read_conversation(conversation_id: UUID, request: Request):
    return relay(request, "GET", "conversations/" + str(conversation_id))


@router.post("/messages")
def chat_message(payload: ChatMessage, request: Request):
    if not payload.message.strip():
        raise HTTPException(422, "Enter a message.")
    return relay(request, "POST", "messages", payload.model_dump(mode="json"))


@router.get("/tickets")
def customer_tickets(request: Request):
    return relay(request, "GET", "tickets")
