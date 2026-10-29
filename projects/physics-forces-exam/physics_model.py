"""SI-unit calculations and exact arrow geometry for the exam-review illustrations."""
from __future__ import annotations

import math


def components(force_newtons: float, angle_degrees: float):
    angle = math.radians(angle_degrees)
    return force_newtons * math.cos(angle), force_newtons * math.sin(angle)


def two_ropes(mass_kg=5.0, gravity=10.0, left_degrees=30.0, right_degrees=60.0):
    """Angles are above the horizontal; the supported body is in equilibrium."""
    left, right = map(math.radians, (left_degrees, right_degrees))
    if mass_kg <= 0 or gravity <= 0 or not (0 < left < math.pi / 2 and 0 < right < math.pi / 2):
        raise ValueError("Use a positive mass and gravity, and two acute rope angles.")
    weight = mass_kg * gravity
    return {
        "gravity_force": weight,
        "left_tension": weight * math.cos(right) / math.sin(left + right),
        "right_tension": weight * math.cos(left) / math.sin(left + right),
    }


def incline(mass_kg=3.0, gravity=10.0, angle_degrees=30.0, friction_coefficient=0.5):
    """Test a trial rest state, with gravity and surface contact as the only forces."""
    if mass_kg <= 0 or gravity <= 0 or not 0 <= angle_degrees < 90 or friction_coefficient < 0:
        raise ValueError("Invalid incline parameters.")
    angle = math.radians(angle_degrees)
    normal = mass_kg * gravity * math.cos(angle)
    required = mass_kg * gravity * math.sin(angle)
    limit = friction_coefficient * normal
    return {
        "normal": normal,
        "friction_required_for_rest": required,
        "friction_limit": limit,
        "rest_possible": required <= limit + 1e-10,
        "critical_angle_degrees": math.degrees(math.atan(friction_coefficient)),
    }


def angled_pull(mass_kg=2.0, gravity=10.0, angle_degrees=30.0, friction_coefficient=0.5, pull_newtons=8.0):
    """Upward angled pull; static-friction analysis stops at the threshold of slipping."""
    if mass_kg <= 0 or gravity <= 0 or not 0 <= angle_degrees < 90 or friction_coefficient < 0 or pull_newtons < 0:
        raise ValueError("Invalid angled-pull parameters.")
    angle = math.radians(angle_degrees)
    horizontal, vertical = components(pull_newtons, angle_degrees)
    normal = mass_kg * gravity - vertical
    limit = friction_coefficient * max(0.0, normal)
    maximum = friction_coefficient * mass_kg * gravity / (math.cos(angle) + friction_coefficient * math.sin(angle))
    return {
        "pull_x": horizontal, "pull_y": vertical,
        "normal": normal, "contact": normal >= 0,
        "friction_required_for_rest": horizontal, "friction_limit": limit,
        "rest_possible": normal >= 0 and horizontal <= limit + 1e-10,
        "maximum_pull_for_rest": maximum,
    }


def arrow_geometry(start, end, width=5):
    """The tip equals end exactly; the shaft stops at the back of the arrowhead."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return None
    ux, uy = dx / length, dy / length
    head_length = min(15.0, length * 0.30)
    half_width = min(max(4.5, width * 1.1), head_length * 0.52)
    base = (end[0] - head_length * ux, end[1] - head_length * uy)
    return {
        "tip": tuple(end), "shaft_end": base,
        "head": [tuple(end), (base[0] - uy * half_width, base[1] + ux * half_width),
                 (base[0] + uy * half_width, base[1] - ux * half_width)],
    }
