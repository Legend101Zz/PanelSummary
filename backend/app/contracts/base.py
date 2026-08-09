"""Shared primitives for versioned ScrollStack contracts."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


Identifier = Annotated[
    str,
    Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    ),
]
ContentHash = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
NonEmptyText = Annotated[str, Field(min_length=1, max_length=20_000)]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]
UnitInterval = Annotated[float, Field(ge=0, le=1)]


class ContractModel(BaseModel):
    """Strict base for all data crossing a service or language boundary."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=False,
        str_strip_whitespace=True,
        validate_default=True,
    )
