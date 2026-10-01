"""HTTP middleware for the Claude Office backend.

Moved out of ``app.main`` in ARC-023. The trust boundary and auth behavior
live here: ``LocalhostOnlyMiddleware`` restricts access to the loopback
interface, and ``ApiKeyMiddleware`` gates state-changing endpoints behind
either an explicit user-configured key or the per-launch auto-generated
token (SEC-001 / SEC-002 / SEC-006). Logic is unchanged from the prior
inline version in ``main.py``.
"""

import hmac
import ipaddress
import logging
import os

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings

# Resolved once at import time, mirroring the previous ``main.py`` pattern.
# ``Settings`` is a pydantic-settings singleton; subsequent ``get_settings()``
# calls return the same instance, so call-time attribute access is identical.
settings = get_settings()

_LOCALHOST_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient"})

logger = logging.getLogger(__name__)


def _allowed_cidrs():
    cidr_raw = os.environ.get("CLAUDE_OFFICE_ALLOW_CIDR", "")
    nets = []
    for part in cidr_raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            logger.warning("Ignoring invalid allowlist entry")
    return nets


class LocalhostOnlyMiddleware(BaseHTTPMiddleware):
    """Reject HTTP requests from non-localhost origins.

    This is a local-only development tool, not deployed to the public internet.
    All API endpoints (including subprocess execution and clipboard writes)
    are protected by restricting access to the loopback interface.

    ``"testclient"`` is the sentinel host used by Starlette's test transport
    and cannot appear on a real TCP connection, so it is safe to allow.
    """

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        client_host = request.client.host if request.client else None
        if client_host in _LOCALHOST_HOSTS:
            return await call_next(request)
        permitted = False
        if client_host:
            try:
                addr = ipaddress.ip_address(client_host)
                permitted = any(addr in net for net in _allowed_cidrs())
            except ValueError:
                permitted = False
        if not permitted:
            return JSONResponse(
                status_code=403,
                content={"detail": "Access denied: localhost only"},
            )
        return await call_next(request)


# Paths that do NOT require an API key (health checks, interactive docs).
# The OpenAPI schema URL is checked separately in the middleware because it is
# served under settings.API_V1_STR (e.g. /api/v1/openapi.json), not /openapi.json.
_NO_AUTH_PATHS = frozenset({"/health", "/docs", "/redoc"})


def _is_state_changing(path: str, method: str) -> bool:
    """Return True if the request targets a destructive or side-effecting endpoint.

    Covers global destructive operations (clearing all sessions, running a
    simulation) and per-session OS side effects (terminal activation + clipboard
    write via ``/focus``). Other per-session mutations remain open in the default
    configuration and are fully gated when an explicit key is set (handled by
    ``settings.has_explicit_key`` in the middleware).
    """
    prefix = settings.API_V1_STR + "/sessions"
    return (
        (path == prefix and method == "DELETE")
        or (path == f"{prefix}/simulate" and method == "POST")
        or (path.startswith(f"{prefix}/") and path.endswith("/focus") and method == "POST")
    )


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Validate X-API-Key header for protected endpoints.

    * When ``CLAUDE_OFFICE_API_KEY`` is explicitly set, ALL non-public paths
      require the key (existing behaviour).
    * When the key is empty (default), state-changing endpoints still require
      the per-launch auto-generated token (``settings.effective_api_key``).
      Read-only paths remain open for backwards compatibility.
    """

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        if request.method == "OPTIONS":
            return await call_next(request)

        # Skip auth for public paths and WebSocket handshakes
        if (
            request.url.path in _NO_AUTH_PATHS
            or request.url.path == f"{settings.API_V1_STR}/openapi.json"
            or request.url.path.startswith("/ws/")
        ):
            return await call_next(request)

        # Duo deployment: the statically served frontend (SPA catch-all
        # plus /_next assets) stays public so keyless browsers can load
        # the page and present ?token= (read into sessionStorage by the
        # frontend, attached as X-API-Key on API calls). Every route
        # under the API namespace keeps the auth logic below.
        api_prefix = settings.API_V1_STR.rstrip("/")
        if not (request.url.path == api_prefix
                or request.url.path.startswith(api_prefix + "/")):
            return await call_next(request)

        # Determine whether auth is required for this request
        requires_auth = settings.has_explicit_key or _is_state_changing(
            request.url.path, request.method
        )

        if not requires_auth:
            return await call_next(request)

        provided = request.headers.get("X-API-Key", "")
        is_admin = bool(settings.effective_api_key) and hmac.compare_digest(
            provided, settings.effective_api_key)
        ingest_key = settings.CLAUDE_OFFICE_INGEST_KEY or ""
        is_ingest = bool(ingest_key) and hmac.compare_digest(provided, ingest_key)
        if is_admin:
            return await call_next(request)
        if is_ingest:
            ingest_path = settings.API_V1_STR + "/events"
            if request.method == "POST" and request.url.path == ingest_path:
                return await call_next(request)
            return JSONResponse(status_code=403,
                                content={"detail": "Ingest key is limited to event ingest"})
        return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
