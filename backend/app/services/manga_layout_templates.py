"""Curated manga layout-template library (issue #5, Session 4).

Promoted from the ``docs/research/layout-templates`` spike (2026-08-07):
LLMs SELECT and ADAPT layouts, they never invent geometry. Every template
here is pure data expressed in the ADR-009 contract node types
(``panel`` / ``split`` / ``overlay``); the ported production compiler
(``manga_layout.compile_page_layout``) remains the only geometry authority.
The spike's toy compiler stays research-only.

Conventions:

- ``instantiate_template`` takes panel IDs in READING order (RTL: first
  panel read is the rightmost of the top row). Split children are laid out
  left-to-right / top-to-bottom by the compiler, so row builders reverse
  the reading order into geometric order.
- Gutter time-semantics from the craft research: vertical gutters between
  panels in a row are narrow (same moment), horizontal gutters between
  rows are wider (time passes).
- Reading edges are emitted as the single authored chain the contracts
  require; ``manga_craft_validation.validate_page_craft`` lints geometric
  RTL coherence after compilation.

Deferred (recorded in the Session 4 handoff): a ``layout-template.v1``
contract schema + broker tool ``list_layout_templates`` for agent-side
selection, seeded jitter, and mask export for lane-C conditioning (#12).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Sequence

#: Narrow gutter between panels in one row (same moment).
X_GUTTER = 0.012
#: Wider gutter between rows (time passes).
Y_GUTTER = 0.03

#: AdaptationBeat narrative purposes (blueprint §11.3) a template can serve.
NARRATIVE_PURPOSES = (
    "hook",
    "setup",
    "conflict",
    "explanation",
    "reveal",
    "payoff",
    "cliffhanger",
)

Node = dict


class TemplateError(ValueError):
    """Unknown template or panel-count mismatch."""


class _NodeIds:
    def __init__(self, template_id: str) -> None:
        self._template_id = template_id
        self._counter = 0

    def next(self) -> str:
        node_id = f"{self._template_id}_n{self._counter}"
        self._counter += 1
        return node_id


def _panel(ids: _NodeIds, panel_id: str) -> Node:
    return {"kind": "panel", "node_id": ids.next(), "panel_id": panel_id}


def _split(
    ids: _NodeIds,
    axis: str,
    ratios: Sequence[float],
    children: list[Node],
    *,
    angle: float = 0.0,
) -> Node:
    return {
        "kind": "split",
        "node_id": ids.next(),
        "axis": axis,
        "ratios": list(ratios),
        "gutter": {
            "value": X_GUTTER if axis == "x" else Y_GUTTER,
            "unit": "page_pct",
        },
        "angle_deg": angle,
        "children": children,
    }


def _row(
    ids: _NodeIds,
    reading_panel_ids: Sequence[str],
    *,
    ratios: Sequence[float] | None = None,
    angle: float = 0.0,
) -> Node:
    """One horizontal row. Panel IDs arrive in RTL reading order (rightmost
    first); children are emitted in geometric left-to-right order, so both
    lists are reversed together."""
    reading_ratios = list(ratios) if ratios is not None else [1.0] * len(reading_panel_ids)
    children = [_panel(ids, panel_id) for panel_id in reversed(reading_panel_ids)]
    return _split(ids, "x", list(reversed(reading_ratios)), children, angle=angle)


def _inset(
    ids: _NodeIds,
    panel_id: str,
    *,
    anchor: str,
    box: tuple[float, float, float, float],
    z_index: int,
    border_style: str = "standard",
) -> Node:
    x, y, width, height = box
    return {
        "node": _panel(ids, panel_id),
        "anchor": anchor,
        "box": {"x": x, "y": y, "width": width, "height": height},
        "z_index": z_index,
        "border_style": border_style,
    }


def _overlay(ids: _NodeIds, base: Node, insets: list[Node]) -> Node:
    return {"kind": "overlay", "node_id": ids.next(), "base": base, "insets": insets}


@dataclass(frozen=True)
class LayoutTemplate:
    template_id: str
    purposes: tuple[str, ...]
    tempo: str
    panel_count: int
    description: str
    builder: Callable[[_NodeIds, Sequence[str]], Node] = field(repr=False)

    def instantiate(self, panel_ids: Sequence[str]) -> tuple[Node, list[dict]]:
        """Panel IDs in reading order -> (layout_root, reading_edges)."""
        if len(panel_ids) != self.panel_count:
            raise TemplateError(
                f"Template {self.template_id} provides {self.panel_count} slots, "
                f"got {len(panel_ids)} panel IDs"
            )
        if len(set(panel_ids)) != len(panel_ids):
            raise TemplateError("panel IDs must be unique")
        layout_root = self.builder(_NodeIds(self.template_id), panel_ids)
        edges = [
            {
                "from_panel_id": earlier,
                "to_panel_id": later,
                "reason": "RTL page flow",
            }
            for earlier, later in zip(panel_ids, panel_ids[1:])
        ]
        return layout_root, edges


# ---------------------------------------------------------------------------
# catalog builders (p = panel IDs in reading order)
# ---------------------------------------------------------------------------


def _t_ref_rows_2_3_2(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids,
        "y",
        [34, 66],
        [
            _row(ids, p[0:2], ratios=[45, 55], angle=-3),
            _split(
                ids,
                "y",
                [50, 50],
                [
                    _row(ids, p[2:5], angle=2),
                    _row(ids, p[5:7], ratios=[55, 45], angle=1.5),
                ],
                angle=1.5,
            ),
        ],
        angle=-2.5,
    )


def _t_page_turn_reveal(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids,
        "y",
        [40, 60],
        [_row(ids, p[0:3]), _panel(ids, p[3])],
        angle=2,
    )


def _t_action_diagonals(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids,
        "y",
        [50, 50],
        [_row(ids, p[0:2], angle=10), _row(ids, p[2:4], angle=-8)],
        angle=-12,
    )


def _t_splash_inset(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _overlay(
        ids,
        _panel(ids, p[0]),
        [
            _inset(ids, p[1], anchor="top_right", box=(0.62, 0.06, 0.32, 0.20), z_index=10),
            _inset(
                ids,
                p[2],
                anchor="bottom_left",
                box=(0.06, 0.72, 0.34, 0.22),
                z_index=20,
                border_style="broken",
            ),
        ],
    )


def _t_quiet_grid_4(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(ids, "y", [50, 50], [_row(ids, p[0:2]), _row(ids, p[2:4])])


def _t_rows_3_flat(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids, "y", [40, 32, 28], [_panel(ids, p[0]), _panel(ids, p[1]), _panel(ids, p[2])]
    )


def _t_rows_2_2_wide(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(ids, "y", [45, 55], [_row(ids, p[0:2]), _row(ids, p[2:4])])


def _t_tall_lead_left(ids: _NodeIds, p: Sequence[str]) -> Node:
    # Reading: right column top -> right column bottom -> tall left closer.
    return _split(
        ids,
        "x",
        [55, 45],
        [
            _panel(ids, p[2]),
            _split(ids, "y", [50, 50], [_panel(ids, p[0]), _panel(ids, p[1])]),
        ],
    )


def _t_tall_lead_right(ids: _NodeIds, p: Sequence[str]) -> Node:
    # Reading: tall right lead -> left column top -> left column bottom.
    return _split(
        ids,
        "x",
        [45, 55],
        [
            _split(ids, "y", [50, 50], [_panel(ids, p[1]), _panel(ids, p[2])]),
            _panel(ids, p[0]),
        ],
    )


def _t_stairs_down(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids,
        "y",
        [25, 75],
        [
            _panel(ids, p[0]),
            _split(
                ids,
                "y",
                [33, 67],
                [
                    _panel(ids, p[1]),
                    _split(
                        ids,
                        "y",
                        [50, 50],
                        [_panel(ids, p[2]), _panel(ids, p[3])],
                        angle=-8,
                    ),
                ],
                angle=-8,
            ),
        ],
        angle=-8,
    )


def _t_conversation_5(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids,
        "y",
        [32, 30, 38],
        [
            _row(ids, p[0:2], angle=1.5),
            _panel(ids, p[2]),
            _row(ids, p[3:5], angle=-1.5),
        ],
    )


def _t_montage_6(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids,
        "y",
        [33, 67],
        [
            _row(ids, p[0:2], angle=2),
            _split(
                ids,
                "y",
                [50, 50],
                [_row(ids, p[2:4], angle=-2), _row(ids, p[4:6], angle=2)],
                angle=-2,
            ),
        ],
        angle=2,
    )


def _t_beat_pause_2(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(ids, "y", [55, 45], [_panel(ids, p[0]), _panel(ids, p[1])])


def _t_cliffhanger_bottom(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids,
        "y",
        [55, 45],
        [
            _split(ids, "y", [50, 50], [_row(ids, p[0:2]), _row(ids, p[2:4])]),
            _panel(ids, p[4]),
        ],
        angle=1.5,
    )


def _t_inset_reaction(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _overlay(
        ids,
        _split(
            ids,
            "y",
            [45, 55],
            [_row(ids, p[0:2], angle=-2), _panel(ids, p[2])],
            angle=-2,
        ),
        [
            _inset(
                ids, p[3], anchor="bottom_right", box=(0.60, 0.50, 0.34, 0.22), z_index=10
            )
        ],
    )


def _t_vertical_thirds(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _row(ids, p[0:3], angle=8)


def _t_spread_splash(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _panel(ids, p[0])


def _t_dense_7_grid(ids: _NodeIds, p: Sequence[str]) -> Node:
    return _split(
        ids,
        "y",
        [34, 66],
        [
            _row(ids, p[0:2]),
            _split(ids, "y", [50, 50], [_row(ids, p[2:5]), _row(ids, p[5:7])]),
        ],
    )


TEMPLATES: dict[str, LayoutTemplate] = {
    template.template_id: template
    for template in [
        LayoutTemplate(
            "t_ref_rows_2_3_2",
            ("setup", "conflict"),
            "normal",
            7,
            "2/3/2 angled rows (One Piece ch.1187 class dialogue/action page).",
            _t_ref_rows_2_3_2,
        ),
        LayoutTemplate(
            "t_page_turn_reveal",
            ("reveal", "payoff"),
            "impact",
            4,
            "3-panel setup strip over a 60% reveal panel (kishotenketsu ten).",
            _t_page_turn_reveal,
        ),
        LayoutTemplate(
            "t_action_diagonals",
            ("conflict",),
            "quick",
            4,
            "High-energy action: strong diagonal cuts.",
            _t_action_diagonals,
        ),
        LayoutTemplate(
            "t_splash_inset",
            ("reveal", "hook"),
            "hold",
            3,
            "Full splash with two overlay insets, one broken border.",
            _t_splash_inset,
        ),
        LayoutTemplate(
            "t_quiet_grid_4",
            ("explanation", "setup"),
            "hold",
            4,
            "Calm 2x2 grid, no angles, wide time gutters.",
            _t_quiet_grid_4,
        ),
        LayoutTemplate(
            "t_rows_3_flat",
            ("setup", "explanation"),
            "hold",
            3,
            "Three flat rows: establishing, medium, detail.",
            _t_rows_3_flat,
        ),
        LayoutTemplate(
            "t_rows_2_2_wide",
            ("setup", "explanation"),
            "normal",
            4,
            "Two wide dialogue rows of two panels.",
            _t_rows_2_2_wide,
        ),
        LayoutTemplate(
            "t_tall_lead_left",
            ("hook", "setup"),
            "normal",
            3,
            "Two stacked right panels closing on a full-height left panel.",
            _t_tall_lead_left,
        ),
        LayoutTemplate(
            "t_tall_lead_right",
            ("hook", "reveal"),
            "normal",
            3,
            "Full-height right lead panel (RTL lead), two stacked left.",
            _t_tall_lead_right,
        ),
        LayoutTemplate(
            "t_stairs_down",
            ("conflict", "cliffhanger"),
            "quick",
            4,
            "Descending stepped rows (escalation).",
            _t_stairs_down,
        ),
        LayoutTemplate(
            "t_conversation_5",
            ("explanation", "conflict"),
            "normal",
            5,
            "2 / wide center reaction band / 2 conversation page.",
            _t_conversation_5,
        ),
        LayoutTemplate(
            "t_montage_6",
            ("explanation",),
            "normal",
            6,
            "3x2 montage grid with slight alternating angles.",
            _t_montage_6,
        ),
        LayoutTemplate(
            "t_beat_pause_2",
            ("payoff",),
            "hold",
            2,
            "Two wide stacked panels (aftermath beat pause).",
            _t_beat_pause_2,
        ),
        LayoutTemplate(
            "t_cliffhanger_bottom",
            ("cliffhanger", "conflict"),
            "impact",
            5,
            "Four small panels over one wide bottom hook panel.",
            _t_cliffhanger_bottom,
        ),
        LayoutTemplate(
            "t_inset_reaction",
            ("conflict", "payoff"),
            "normal",
            4,
            "Three-panel page with a corner reaction inset.",
            _t_inset_reaction,
        ),
        LayoutTemplate(
            "t_vertical_thirds",
            ("conflict",),
            "quick",
            3,
            "Three tall angled columns (action).",
            _t_vertical_thirds,
        ),
        LayoutTemplate(
            "t_spread_splash",
            ("reveal", "hook"),
            "impact",
            1,
            "Single splash panel (spread page kinds).",
            _t_spread_splash,
        ),
        LayoutTemplate(
            "t_dense_7_grid",
            ("explanation", "conflict"),
            "normal",
            7,
            "2/3/2 flat grid for dense dialogue pages.",
            _t_dense_7_grid,
        ),
    ]
}


def get_template(template_id: str) -> LayoutTemplate:
    template = TEMPLATES.get(template_id)
    if template is None:
        raise TemplateError(f"Unknown layout template {template_id}")
    return template


def instantiate_template(
    template_id: str, panel_ids: Sequence[str]
) -> tuple[Node, list[dict]]:
    return get_template(template_id).instantiate(panel_ids)


def list_templates(
    *,
    purpose: str | None = None,
    tempo: str | None = None,
    panel_count: int | None = None,
) -> list[LayoutTemplate]:
    result = []
    for template in TEMPLATES.values():
        if purpose is not None and purpose not in template.purposes:
            continue
        if tempo is not None and template.tempo != tempo:
            continue
        if panel_count is not None and template.panel_count != panel_count:
            continue
        result.append(template)
    return sorted(result, key=lambda item: item.template_id)
