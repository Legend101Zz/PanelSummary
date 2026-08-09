"""Domain errors mapped to stable HTTP responses at the API edge."""


class ControlPlaneError(Exception):
    code = "control_plane_error"


class NotFoundError(ControlPlaneError):
    code = "not_found"


class InvalidScopeError(ControlPlaneError):
    code = "invalid_scope"


class ContextBudgetError(ControlPlaneError):
    code = "context_budget_exceeded"


class UnsupportedSourceError(ControlPlaneError):
    code = "unsupported_source"


class StaleMemoryDeltaError(ControlPlaneError):
    code = "stale_memory_delta"


class MemoryConflictError(ControlPlaneError):
    code = "memory_conflict"


class InvalidRunStateError(ControlPlaneError):
    code = "invalid_run_state"


class InvalidPdfError(ControlPlaneError):
    code = "invalid_pdf"


class PdfLimitError(ControlPlaneError):
    code = "pdf_limit_exceeded"


class AuthorizationError(ControlPlaneError):
    code = "authorization_failed"


class ArtifactValidationError(ControlPlaneError):
    code = "artifact_validation_failed"


class InvalidProgressError(ControlPlaneError):
    code = "invalid_progress"
