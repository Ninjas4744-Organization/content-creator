"""Centimetres shared by every original 2026 explanatory animation.

Field dimensions: FIRST REBUILT manual sections 5.2–5.10.
Robot dimensions are an illustrative ~1 m footprint fitted to the team's photos,
not engineering CAD. Front is -X; the deploying intake is at +X.
"""
FUEL_DIAMETER = 15.0
FUEL_RADIUS = FUEL_DIAMETER / 2
ROBOT_LENGTH = 104.0
ROBOT_WIDTH = 92.0
TOP_CANVAS_CM = 180.0
PRACTICE_ROBOT_SIZE = 112
FIELD_LENGTH = 1654.0
FIELD_WIDTH = 807.0
HUB_SIDE = 119.38
HUB_OPENING = 105.918
HUB_RIM_HEIGHT = 182.88
HUB_FRONT = 402.844
HUB_CENTER_X = HUB_FRONT + HUB_SIDE / 2
BUMP_DEPTH = 112.776
BUMP_WIDTH = 185.42
BUMP_HEIGHT = 16.543
TRENCH_DEPTH = 119.38
TRENCH_WIDTH = 166.751
TRENCH_CLEARANCE = 56.515
TRENCH_HEIGHT = 102.235
TOWER_WIDTH = 125.095
TOWER_DEPTH = 114.3
TOWER_HEIGHT = 198.755
RUNG_HEIGHTS = (68.58, 114.3, 160.02)


def fuel_radius(pixels_per_cm):
    return FUEL_RADIUS * pixels_per_cm
