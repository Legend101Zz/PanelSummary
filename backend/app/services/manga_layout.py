"""Authoritative deterministic compiler and SVG name preview for manga page plans."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
from math import hypot, radians, tan

from app.contracts.manga import (
    CompiledPageLayout,
    CompiledPanelGeometry,
    FreeformPanelLayoutNode,
    LayoutNode,
    MangaPagePlan,
    NormalizedBox,
    NormalizedPoint,
    OverlayLayoutNode,
    PageValidationIssue,
    PanelAdjacency,
    PanelLayoutNode,
)

from .hashing import content_hash

LAYOUT_ENGINE_VERSION = "manga-layout.v1"
MIN_PANEL_EDGE = 0.035
MIN_PANEL_AREA = 0.0025
GEOMETRY_EPSILON = 1e-7
ADJACENCY_DISTANCE = 0.03


class LayoutCompilationError(ValueError):
    def __init__(self, issues: list[PageValidationIssue]) -> None:
        self.issues = issues
        super().__init__("; ".join(f"{issue.code}: {issue.message}" for issue in issues))


@dataclass(frozen=True)
class _PlacedPanel:
    panel_id: str
    node_id: str
    polygon: tuple[tuple[float, float], ...]
    z_index: int


def _rounded(value: float) -> float:
    result = round(min(1.0, max(0.0, value)), 6)
    return 0.0 if result == -0.0 else result


def _box_polygon(box: NormalizedBox) -> tuple[tuple[float, float], ...]:
    return (
        (box.x, box.y),
        (box.x + box.width, box.y),
        (box.x + box.width, box.y + box.height),
        (box.x, box.y + box.height),
    )


def _polygon_area(polygon: tuple[tuple[float, float], ...]) -> float:
    return abs(
        sum(
            x1 * y2 - x2 * y1
            for (x1, y1), (x2, y2) in zip(polygon, polygon[1:] + polygon[:1], strict=True)
        )
        / 2
    )


def _bbox(polygon: tuple[tuple[float, float], ...]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _cross(
    edge_start: tuple[float, float],
    edge_end: tuple[float, float],
    point: tuple[float, float],
) -> float:
    return (edge_end[0] - edge_start[0]) * (point[1] - edge_start[1]) - (
        edge_end[1] - edge_start[1]
    ) * (point[0] - edge_start[0])


def _intersection(
    start: tuple[float, float],
    end: tuple[float, float],
    clip_start: tuple[float, float],
    clip_end: tuple[float, float],
) -> tuple[float, float]:
    dx1, dy1 = end[0] - start[0], end[1] - start[1]
    dx2, dy2 = clip_end[0] - clip_start[0], clip_end[1] - clip_start[1]
    denominator = dx1 * dy2 - dy1 * dx2
    if abs(denominator) <= GEOMETRY_EPSILON:
        return end
    t = ((clip_start[0] - start[0]) * dy2 - (clip_start[1] - start[1]) * dx2) / denominator
    return start[0] + t * dx1, start[1] + t * dy1


def _clip_polygon(
    subject: tuple[tuple[float, float], ...],
    clip: tuple[tuple[float, float], ...],
) -> tuple[tuple[float, float], ...]:
    """Clip a polygon against a convex, counter-clockwise parent polygon."""

    output = list(subject)
    for clip_start, clip_end in zip(clip, clip[1:] + clip[:1], strict=True):
        input_points = output
        output = []
        if not input_points:
            break
        previous = input_points[-1]
        previous_inside = _cross(clip_start, clip_end, previous) >= -GEOMETRY_EPSILON
        for current in input_points:
            current_inside = _cross(clip_start, clip_end, current) >= -GEOMETRY_EPSILON
            if current_inside:
                if not previous_inside:
                    output.append(_intersection(previous, current, clip_start, clip_end))
                output.append(current)
            elif previous_inside:
                output.append(_intersection(previous, current, clip_start, clip_end))
            previous = current
            previous_inside = current_inside
    return tuple((_rounded(x), _rounded(y)) for x, y in output)


def polygon_overlap_area(
    first: list[NormalizedPoint],
    second: list[NormalizedPoint],
) -> float:
    """Return the intersection area of two convex normalized polygons."""

    subject = tuple((point.x, point.y) for point in first)
    clip = tuple((point.x, point.y) for point in second)
    intersection = _clip_polygon(subject, clip)
    return _polygon_area(intersection) if len(intersection) >= 3 else 0.0


def point_in_polygon(point: NormalizedPoint, polygon: list[NormalizedPoint]) -> bool:
    """Return whether a normalized point is inside or on a polygon boundary."""

    inside = False
    previous = polygon[-1]
    for current in polygon:
        if (
            min(previous.x, current.x) - GEOMETRY_EPSILON <= point.x
            <= max(previous.x, current.x) + GEOMETRY_EPSILON
            and min(previous.y, current.y) - GEOMETRY_EPSILON <= point.y
            <= max(previous.y, current.y) + GEOMETRY_EPSILON
            and abs(
                (current.x - previous.x) * (point.y - previous.y)
                - (current.y - previous.y) * (point.x - previous.x)
            )
            <= GEOMETRY_EPSILON
        ):
            return True
        intersects = (current.y > point.y) != (previous.y > point.y)
        if intersects:
            x_cross = (previous.x - current.x) * (point.y - current.y) / (
                previous.y - current.y
            ) + current.x
            if point.x < x_cross:
                inside = not inside
        previous = current
    return inside


def _slab_polygon(
    *,
    axis: str,
    start: float,
    end: float,
    bbox: tuple[float, float, float, float],
    angle_deg: float,
) -> tuple[tuple[float, float], ...]:
    x0, y0, x1, y1 = bbox
    if axis == "x":
        delta = tan(radians(angle_deg)) * (y1 - y0) / 2
        return (
            (start - delta, y0),
            (end - delta, y0),
            (end + delta, y1),
            (start + delta, y1),
        )
    delta = tan(radians(angle_deg)) * (x1 - x0) / 2
    return (
        (x0, start - delta),
        (x1, start + delta),
        (x1, end + delta),
        (x0, end - delta),
    )


def _compile_node(
    node: LayoutNode,
    container: tuple[tuple[float, float], ...],
    *,
    z_index: int = 0,
) -> list[_PlacedPanel]:
    if isinstance(node, PanelLayoutNode):
        return [_PlacedPanel(node.panel_id, node.node_id, container, z_index)]
    if isinstance(node, FreeformPanelLayoutNode):
        raw = tuple((point.x, point.y) for point in node.polygon)
        clipped = _clip_polygon(raw, container)
        return [_PlacedPanel(node.panel_id, node.node_id, clipped, z_index)]
    if isinstance(node, OverlayLayoutNode):
        overlay_placed = _compile_node(node.base, container, z_index=z_index)
        for inset in sorted(node.insets, key=lambda item: (item.z_index, item.node.node_id)):
            inset_polygon = _clip_polygon(_box_polygon(inset.box), container)
            overlay_placed.extend(
                _compile_node(inset.node, inset_polygon, z_index=inset.z_index)
            )
        return overlay_placed

    parent_bbox = _bbox(container)
    x0, y0, x1, y1 = parent_bbox
    axis_start, axis_end = (x0, x1) if node.axis == "x" else (y0, y1)
    span = axis_end - axis_start
    total_gutter = node.gutter.value * (len(node.children) - 1)
    available = span - total_gutter
    if available <= GEOMETRY_EPSILON:
        raise LayoutCompilationError(
            [
                PageValidationIssue(
                    code="GUTTER_OVERSIZED",
                    severity="error",
                    message="Split gutters consume the complete parent span.",
                    path=f"/layout_root/{node.node_id}/gutter/value",
                    node_id=node.node_id,
                )
            ]
        )
    ratio_total = sum(node.ratios)
    cursor = axis_start
    split_placed: list[_PlacedPanel] = []
    for index, (ratio, child) in enumerate(zip(node.ratios, node.children, strict=True)):
        child_span = available * ratio / ratio_total
        child_end = axis_end if index == len(node.children) - 1 else cursor + child_span
        slab = _slab_polygon(
            axis=node.axis,
            start=cursor,
            end=child_end,
            bbox=parent_bbox,
            angle_deg=node.angle_deg,
        )
        child_polygon = _clip_polygon(slab, container)
        split_placed.extend(_compile_node(child, child_polygon, z_index=z_index))
        cursor = child_end + node.gutter.value
    return split_placed


def _reading_ranks(plan: MangaPagePlan) -> dict[str, int]:
    panel_ids = {panel.panel_id for panel in plan.page_script.panels}
    if len(panel_ids) == 1:
        return {next(iter(panel_ids)): 0}
    outgoing = {edge.from_panel_id: edge.to_panel_id for edge in plan.reading_edges}
    incoming = {edge.to_panel_id for edge in plan.reading_edges}
    current = next(iter(panel_ids - incoming))
    ordered: list[str] = []
    while current not in ordered:
        ordered.append(current)
        if current not in outgoing:
            break
        current = outgoing[current]
    return {panel_id: rank for rank, panel_id in enumerate(ordered)}


def _clip_path(polygon: tuple[tuple[float, float], ...]) -> str:
    commands = [f"M {polygon[0][0]:.6f} {polygon[0][1]:.6f}"]
    commands.extend(f"L {x:.6f} {y:.6f}" for x, y in polygon[1:])
    commands.append("Z")
    return " ".join(commands)


def _adjacency(panels: list[_PlacedPanel]) -> list[PanelAdjacency]:
    result: list[PanelAdjacency] = []
    for index, left in enumerate(panels):
        lx0, ly0, lx1, ly1 = _bbox(left.polygon)
        for right in panels[index + 1 :]:
            rx0, ry0, rx1, ry1 = _bbox(right.polygon)
            overlap_x = min(lx1, rx1) - max(lx0, rx0)
            overlap_y = min(ly1, ry1) - max(ly0, ry0)
            if overlap_x > GEOMETRY_EPSILON and overlap_y > GEOMETRY_EPSILON:
                relation = "overlap"
            elif (
                overlap_y > GEOMETRY_EPSILON
                and max(rx0 - lx1, lx0 - rx1, 0) <= ADJACENCY_DISTANCE
            ):
                relation = "horizontal"
            elif (
                overlap_x > GEOMETRY_EPSILON
                and max(ry0 - ly1, ly0 - ry1, 0) <= ADJACENCY_DISTANCE
            ):
                relation = "vertical"
            else:
                horizontal_gap = max(rx0 - lx1, lx0 - rx1, 0)
                vertical_gap = max(ry0 - ly1, ly0 - ry1, 0)
                if hypot(horizontal_gap, vertical_gap) > ADJACENCY_DISTANCE:
                    continue
                relation = "near"
            result.append(
                PanelAdjacency(
                    panel_a=min(left.panel_id, right.panel_id),
                    panel_b=max(left.panel_id, right.panel_id),
                    relation=relation,
                )
            )
    return sorted(result, key=lambda item: (item.panel_a, item.panel_b, item.relation))


def compile_page_layout(plan: MangaPagePlan) -> CompiledPageLayout:
    """Compile one validated authored page plan with no I/O or provider dependency."""

    trim_polygon = _box_polygon(plan.canvas.trim)
    placed = _compile_node(plan.layout_root, trim_polygon)
    ranks = _reading_ranks(plan)
    issues: list[PageValidationIssue] = []
    for panel in placed:
        if len(panel.polygon) < 3:
            issues.append(
                PageValidationIssue(
                    code="PANEL_CLIPPED_EMPTY",
                    severity="error",
                    message="Panel geometry is empty after clipping to its parent.",
                    path=f"/layout_root/{panel.node_id}",
                    node_id=panel.node_id,
                )
            )
            continue
        x0, y0, x1, y1 = _bbox(panel.polygon)
        if (
            x1 - x0 < MIN_PANEL_EDGE
            or y1 - y0 < MIN_PANEL_EDGE
            or _polygon_area(panel.polygon) < MIN_PANEL_AREA
        ):
            issues.append(
                PageValidationIssue(
                    code="PANEL_TOO_SMALL",
                    severity="error",
                    message="Compiled panel is below the minimum edge or area threshold.",
                    path=f"/layout_root/{panel.node_id}",
                    node_id=panel.node_id,
                )
            )
    if plan.page_script.page_turn_panel_id is not None:
        final_panel = max(ranks, key=ranks.__getitem__)
        if plan.page_script.page_turn_panel_id != final_panel:
            issues.append(
                PageValidationIssue(
                    code="PAGE_TURN_NOT_LAST",
                    severity="error",
                    message="The page-turn panel must be last in the authored reading chain.",
                    path="/page_script/page_turn_panel_id",
                    node_id=None,
                )
            )
    if issues:
        raise LayoutCompilationError(issues)

    compiled_panels: list[CompiledPanelGeometry] = []
    for panel in sorted(placed, key=lambda item: ranks[item.panel_id]):
        x0, y0, x1, y1 = _bbox(panel.polygon)
        compiled_panels.append(
            CompiledPanelGeometry(
                panel_id=panel.panel_id,
                node_id=panel.node_id,
                polygon=[NormalizedPoint(x=x, y=y) for x, y in panel.polygon],
                bbox=NormalizedBox(x=x0, y=y0, width=x1 - x0, height=y1 - y0),
                clip_path=_clip_path(panel.polygon),
                z_index=panel.z_index,
                read_rank=ranks[panel.panel_id],
            )
        )
    identity = {
        "layout_engine_version": LAYOUT_ENGINE_VERSION,
        "page_plan": plan.model_dump(mode="json"),
        "compiled_panels": [item.model_dump(mode="json") for item in compiled_panels],
    }
    return CompiledPageLayout(
        schema_version="compiled-layout.v1",
        page_plan_id=plan.page_plan_id,
        layout_engine_version=LAYOUT_ENGINE_VERSION,
        compiler_hash=content_hash(identity),
        panels=compiled_panels,
        adjacency=_adjacency(placed),
    )


def render_thumbnail_svg(plan: MangaPagePlan, compiled: CompiledPageLayout) -> str:
    """Render a deterministic, image-free SVG name preview from compiled geometry."""

    if compiled.page_plan_id != plan.page_plan_id:
        raise ValueError("compiled layout does not belong to page plan")
    width = 600
    height = round(width * plan.canvas.height_px / plan.canvas.width_px)
    panel_by_id = {panel.panel_id: panel for panel in compiled.panels}
    script_by_id = {panel.panel_id: panel for panel in plan.page_script.panels}
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" role="img" '
        f'aria-label="Thumbnail for {escape(plan.page_script.page_id)}" '
        f'viewBox="0 0 {width} {height}">',
        "<defs>",
        '<marker id="reading_arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" '
        'orient="auto"><path d="M 0 0 L 6 3 L 0 6 Z" fill="#bd392f" /></marker>',
    ]
    for panel in compiled.panels:
        points = " ".join(
            f"{point.x * width:.2f},{point.y * height:.2f}" for point in panel.polygon
        )
        lines.append(
            f'<clipPath id="clip_{escape(panel.node_id)}">'
            f'<polygon points="{points}" /></clipPath>'
        )
    lines.extend(
        [
            "</defs>",
            f'<rect width="{width}" height="{height}" fill="#171512" />',
        ]
    )
    for panel in compiled.panels:
        points = " ".join(
            f"{point.x * width:.2f},{point.y * height:.2f}" for point in panel.polygon
        )
        lines.append(
            f'<polygon data-panel-id="{escape(panel.panel_id)}" points="{points}" '
            'fill="#f4eedf" stroke="#171512" stroke-width="4" />'
        )
    for edge in plan.reading_edges:
        source, target = panel_by_id[edge.from_panel_id], panel_by_id[edge.to_panel_id]
        x1 = (source.bbox.x + source.bbox.width / 2) * width
        y1 = (source.bbox.y + source.bbox.height / 2) * height
        x2 = (target.bbox.x + target.bbox.width / 2) * width
        y2 = (target.bbox.y + target.bbox.height / 2) * height
        lines.append(
            f'<path data-reading-edge="{escape(edge.from_panel_id)}:{escape(edge.to_panel_id)}" '
            f'd="M {x1:.2f} {y1:.2f} L {x2:.2f} {y2:.2f}" '
            'stroke="#bd392f" stroke-width="4" stroke-dasharray="8 6" fill="none" '
            'opacity="0.78" marker-end="url(#reading_arrow)" />'
        )
    for panel in compiled.panels:
        cx = (panel.bbox.x + panel.bbox.width / 2) * width
        cy = (panel.bbox.y + panel.bbox.height / 2) * height
        lines.append(
            f'<text x="{cx:.2f}" y="{cy:.2f}" text-anchor="middle" '
            'font-family="sans-serif" font-size="18" font-weight="700" fill="#171512" '
            'stroke="#f4eedf" stroke-width="7" paint-order="stroke">'
            f'{panel.read_rank + 1}. {escape(script_by_id[panel.panel_id].camera.shot)}</text>'
        )
        for index, blocking in enumerate(script_by_id[panel.panel_id].blocking):
            bx, by = blocking.anchor.x * width, blocking.anchor.y * height
            lines.append(
                f'<g data-subject="{escape(blocking.subject_ref)}" opacity="0.7">'
                f'<circle cx="{bx:.2f}" cy="{by - 10:.2f}" r="8" fill="#51483c" />'
                f'<path d="M {bx:.2f} {by:.2f} l 0 28 m -10 -16 l 20 0" '
                f'stroke="#51483c" stroke-width="4" data-order="{index}" /></g>'
            )
        for index, region in enumerate(script_by_id[panel.panel_id].focal_regions):
            lines.append(
                f'<rect data-focal-region="{escape(panel.panel_id)}:{index}" '
                f'x="{region.x * width:.2f}" y="{region.y * height:.2f}" '
                f'width="{region.width * width:.2f}" height="{region.height * height:.2f}" '
                'fill="none" stroke="#4d7f3a" stroke-width="3" />'
            )
        for index, region in enumerate(script_by_id[panel.panel_id].avoid_text_regions):
            lines.append(
                f'<rect data-avoid-text-region="{escape(panel.panel_id)}:{index}" '
                f'x="{region.x * width:.2f}" y="{region.y * height:.2f}" '
                f'width="{region.width * width:.2f}" height="{region.height * height:.2f}" '
                'fill="none" stroke="#a85f24" stroke-width="3" stroke-dasharray="3 4" />'
            )
    for text in plan.page_script.text_elements:
        box = text.preferred_region
        lines.append(
            f'<rect data-text-id="{escape(text.text_id)}" x="{box.x * width:.2f}" '
            f'y="{box.y * height:.2f}" width="{box.width * width:.2f}" '
            f'height="{box.height * height:.2f}" fill="none" stroke="#286f6c" '
            'stroke-width="3" stroke-dasharray="5 4" />'
        )
    lines.append("</svg>")
    return "\n".join(lines) + "\n"
