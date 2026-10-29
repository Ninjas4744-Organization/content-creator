import importlib.util
import math
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / "projects/physics-forces-exam/physics_model.py"
spec = importlib.util.spec_from_file_location("physics_review_model", MODULE)
physics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(physics)


class PhysicsReviewTests(unittest.TestCase):
    def test_components_preserve_magnitude_and_signs(self):
        for angle in [-135, -30, 0, 30, 90, 120, 180]:
            x, y = physics.components(10, angle)
            self.assertAlmostEqual(x*x+y*y, 100)
        x, y = physics.components(10, 120)
        self.assertLess(x, 0)
        self.assertGreater(y, 0)

    def test_complementary_angles_exchange_components(self):
        for angle in [10, 25, 37, 60, 80]:
            x, y = physics.components(1, angle)
            xc, yc = physics.components(1, 90-angle)
            self.assertAlmostEqual(x, yc)
            self.assertAlmostEqual(y, xc)

    def test_asymmetric_ropes_balance_both_axes(self):
        result = physics.two_ropes()
        left, right = result["left_tension"], result["right_tension"]
        self.assertAlmostEqual(left, 25)
        self.assertAlmostEqual(right, 25*math.sqrt(3))
        lx, ly = physics.components(left, 150)
        rx, ry = physics.components(right, 60)
        self.assertAlmostEqual(lx+rx, 0)
        self.assertAlmostEqual(ly+ry, result["gravity_force"])

    def test_incline_requires_more_friction_than_available(self):
        result = physics.incline()
        self.assertAlmostEqual(result["normal"], 15*math.sqrt(3))
        self.assertAlmostEqual(result["friction_required_for_rest"], 15)
        self.assertFalse(result["rest_possible"])
        self.assertAlmostEqual(result["critical_angle_degrees"], 26.56505117707799)

    def test_incline_identity_predicts_threshold_on_either_side(self):
        for coefficient in [0.2, 0.5, 1.2]:
            threshold = math.degrees(math.atan(coefficient))
            self.assertTrue(physics.incline(angle_degrees=threshold-0.1, friction_coefficient=coefficient)["rest_possible"])
            self.assertFalse(physics.incline(angle_degrees=threshold+0.1, friction_coefficient=coefficient)["rest_possible"])

    def test_upward_pull_reduces_normal_and_has_correct_threshold(self):
        result = physics.angled_pull()
        self.assertAlmostEqual(result["normal"], 16)
        self.assertTrue(result["rest_possible"])
        limit = result["maximum_pull_for_rest"]
        at_limit = physics.angled_pull(pull_newtons=limit)
        self.assertAlmostEqual(at_limit["friction_required_for_rest"], at_limit["friction_limit"])
        self.assertGreater(at_limit["normal"], 0)
        self.assertTrue(physics.angled_pull(pull_newtons=limit-0.01)["rest_possible"])
        self.assertFalse(physics.angled_pull(pull_newtons=limit+0.01)["rest_possible"])

    def test_arrowhead_tips_follow_exact_endpoints_in_every_direction(self):
        for end in [(110, 0), (-110, 0), (0, -110), (0, 110), (40, -50), (0.1, 0.2)]:
            geometry = physics.arrow_geometry((0, 0), end)
            self.assertEqual(geometry["tip"], end)
            self.assertEqual(geometry["head"][0], end)
            base = geometry["shaft_end"]
            self.assertLess(math.hypot(*base), math.hypot(*end))
            a, b = geometry["head"][1:]
            self.assertAlmostEqual((a[0]+b[0])/2, base[0])
            self.assertAlmostEqual((a[1]+b[1])/2, base[1])
        self.assertIsNone(physics.arrow_geometry((1, 1), (1, 1)))


if __name__ == "__main__":
    unittest.main()
