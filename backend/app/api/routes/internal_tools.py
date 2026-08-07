"""Internal agent domain-tool HTTP boundary.

Adapted from ScrollStack ``backend/app/api/internal_tools.py`` @ 43300b5
(ADR-012 boundary edits — this repo has no ``app.container`` composition
root and no global ``ControlPlaneError`` exception handler):

1. The router factory takes the domain-tool service directly instead of
   ``ControlPlaneServices``.
2. ``ControlPlaneError`` subclasses are mapped to HTTP statuses locally,
   with exactly the donor ``create_app`` handler's mapping
   (AuthorizationError -> 403, NotFoundError -> 404, everything else,
   including ArtifactValidationError -> 422). v1 keeps its own error
   surface untouched.

The bearer-token check is byte-equivalent to the donor's
(``hmac.compare_digest`` against the shared ``DOMAIN_TOOL_BROKER_TOKEN``).
"""

from __future__ import annotations

import hmac
import logging
from typing import Protocol

from fastapi import APIRouter, Header, HTTPException, status

from app.services.domain_tools import DomainToolRequest, DomainToolResponse
from app.services.errors import (
    AuthorizationError,
    ControlPlaneError,
    NotFoundError,
)

logger = logging.getLogger(__name__)


class DomainToolExecutor(Protocol):
    async def execute(
        self, tool_name: str, request: DomainToolRequest
    ) -> DomainToolResponse: ...


def internal_tools_router(
    domain_tools: DomainToolExecutor, *, service_token: str
) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/internal/v1/agent-tools/{tool_name}",
        response_model=DomainToolResponse,
        tags=["internal-agent-tools"],
    )
    async def execute_agent_tool(
        tool_name: str,
        request: DomainToolRequest,
        authorization: str | None = Header(default=None),
    ) -> DomainToolResponse:
        expected = f"Bearer {service_token}"
        if authorization is None or not hmac.compare_digest(authorization, expected):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "unauthorized", "message": "Bearer service token required"},
            )
        try:
            return await domain_tools.execute(tool_name, request)
        except ControlPlaneError as error:
            error_status = status.HTTP_422_UNPROCESSABLE_ENTITY
            if isinstance(error, AuthorizationError):
                error_status = status.HTTP_403_FORBIDDEN
            elif isinstance(error, NotFoundError):
                error_status = status.HTTP_404_NOT_FOUND
            # Operator-side visibility: the sealed agent sees only the bounded
            # error text, so a rejected tool call would otherwise be invisible
            # to whoever is debugging the run.
            logger.warning(
                "agent tool %s rejected (%s) run=%s stage=%s: %s",
                tool_name,
                error.code,
                request.scope.run_id,
                request.scope.stage_run_id,
                error,
            )
            raise HTTPException(
                status_code=error_status,
                detail={"code": error.code, "message": str(error)},
            ) from error

    return router
