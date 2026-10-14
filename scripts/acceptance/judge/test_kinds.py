"""Tests for kinds.py and kinds_rates.py: the published defect rates must reproduce from the fixtures.

Run: python3 -m unittest discover -s scripts/acceptance/judge -v
"""
import io
import json
import os
import sys
import unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kinds  # noqa: E402
import kinds_rates  # noqa: E402

FX = os.path.join(HERE, "fixtures")


def fx(name):
    return os.path.join(FX, name + ".json.gz")


def rate(name, kind, severities=kinds_rates.DEFAULT_SEVERITIES):
    return f"{kinds_rates.rates(fx(name), severities)[1][kind]:.2f}"


class ClassifierRules(unittest.TestCase):
    def test_rule_names_and_order_are_the_v01_rules(self):
        self.assertEqual(kinds.KINDS, [
            "claim_not_stated", "hero_tiny", "key_prop_not_drawn", "tail_wrong", "setting_wrong", "invented",
            "page_turn", "statue_staging", "speech_as_narration", "state_continuity", "order", "beat_skipped",
            "quote_clipped", "label_clutter", "cast_crowd", "repeat_variety", "plan_overload", "fidelity_label",
            "page_missing", "balloon_covers", "pose_unreadable"])

    def test_rule_table_is_pinned(self):
        # SHA-256 of repr(K) of the original launch/clusters/kinds2.py. A changed keyword, order or
        # title fails here. Change this value only with a new classifier version (see the module docstring).
        import hashlib
        self.assertEqual(hashlib.sha256(repr(kinds.K).encode()).hexdigest(),
                         "d61d75ad42cfc399af545576955f7fb0ba6a5fd8635852e655478f621632f8a9")

    def test_labels(self):
        self.assertEqual(kinds.labels({"what": "The prince is a tiny speck, cropped at the edge."}), ["hero_tiny"])
        self.assertIn("tail_wrong", kinds.labels({"what": "SPEAKER_OFF_PANEL on p3"}))
        self.assertIn("label_clutter", kinds.labels({"what": "name-tag labels everywhere"}))
        self.assertEqual(kinds.labels({"what": "A calm, clear page."}), [])
        self.assertEqual(kinds.TITLE["repeat_variety"], "Repeated near-identical panels, no dominant panel, flat variety")


class V01Gate2(unittest.TestCase):
    """docs/v0.2/GATES.md section 4: the v0.1 report's numbers for gate2-flash-ci (46 pages, 3 judges)."""

    def test_judge_pages(self):
        self.assertEqual(kinds_rates.rates(fx("v01-gate2-flash"))[0], 138)

    def test_published_rates(self):
        self.assertEqual(rate("v01-gate2-flash", "hero_tiny"), "0.62")
        self.assertEqual(rate("v01-gate2-flash", "tail_wrong"), "0.22")
        self.assertEqual(rate("v01-gate2-flash", "label_clutter"), "0.20")
        self.assertEqual(rate("v01-gate2-flash", "repeat_variety"), "0.17")

    def test_complete_run_rates(self):
        # GATES.md section 4, table "v0.1 complete run (60 pages)"
        self.assertEqual(kinds_rates.rates(fx("v01-gate2b"))[0], 180)
        self.assertEqual(rate("v01-gate2b", "hero_tiny"), "0.48")
        self.assertEqual(rate("v01-gate2b", "tail_wrong"), "0.20")
        self.assertEqual(rate("v01-gate2b", "label_clutter"), "0.16")
        self.assertEqual(rate("v01-gate2b", "repeat_variety"), "0.09")


class V02Gate2(unittest.TestCase):
    def test_judge_pages_include_the_failed_page(self):
        self.assertEqual(kinds_rates.rates(fx("v02-gate2"))[0], 183)

    def test_published_rates(self):
        self.assertEqual(rate("v02-gate2", "hero_tiny"), "0.35")
        self.assertEqual(rate("v02-gate2", "tail_wrong"), "0.11")
        self.assertEqual(rate("v02-gate2", "label_clutter"), "0.08")
        self.assertEqual(rate("v02-gate2", "repeat_variety"), "0.08")


class JustSoHoldOut(unittest.TestCase):
    """docs/v0.2/GATES.md section 5. All published numbers reproduce from the fixtures."""

    def test_key_prop_not_drawn_v02_runs(self):
        self.assertEqual([rate(f"v02-justso-{i}", "key_prop_not_drawn") for i in (1, 2, 3)], ["0.73", "0.86", "0.64"])

    def test_wrong_setting_v02_runs(self):
        self.assertEqual([rate(f"v02-justso-{i}", "setting_wrong") for i in (1, 2, 3)], ["0.18", "0.15", "0.11"])

    def test_v010_baseline(self):
        self.assertEqual(rate("v01-justso", "key_prop_not_drawn"), "0.59")
        self.assertEqual(rate("v01-justso", "setting_wrong"), "0.09")

    def test_label_clutter(self):
        self.assertEqual(rate("v01-justso", "label_clutter"), "0.43")
        self.assertEqual([rate(f"v02-justso-{i}", "label_clutter") for i in (1, 2, 3)], ["0.16", "0.10", "0.09"])


class RateScript(unittest.TestCase):
    def test_severity_option_changes_the_count(self):
        major = kinds_rates.rates(fx("v02-gate2"))[1]["hero_tiny"]
        all_sev = kinds_rates.rates(fx("v02-gate2"), ("blocker", "major", "minor"))[1]["hero_tiny"]
        self.assertGreater(all_sev, major)
        self.assertEqual(kinds_rates.rates(fx("v02-gate2"), ("blocker",))[1]["hero_tiny"] <= major, True)

    def test_every_kind_is_in_the_result(self):
        self.assertEqual(sorted(kinds_rates.rates(fx("v02-gate1"))[1]), sorted(kinds.KINDS))

    def test_raw_judgments_list_works(self):
        raw = [{"judge": 1, "page": 1, "scores": {}, "ships": False, "defects": [
            {"severity": "major", "what": "tiny speck"}, {"severity": "minor", "what": "tiny speck"}]},
            {"judge": 1, "page": 2, "scores": {}, "ships": True, "defects": []}]
        n, r = kinds_rates.rates_from_judgments(raw)
        self.assertEqual((n, r["hero_tiny"]), (2, 0.5))

    def test_cli_json_and_kinds(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            kinds_rates.main([f"g2={fx('v01-gate2-flash')}", "--kinds", "hero_tiny,tail_wrong", "--json"])
        out = json.loads(buf.getvalue())
        self.assertEqual(out["severities"], ["blocker", "major"])
        run = out["runs"][0]
        self.assertEqual((run["label"], run["judge_pages"]), ("g2", 138))
        self.assertEqual(sorted(run["rates"]), ["hero_tiny", "tail_wrong"])
        self.assertEqual(f"{run['rates']['hero_tiny']:.2f}", "0.62")

    def test_cli_table(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            kinds_rates.main([fx("v01-gate2-flash"), fx("v02-gate2"), "--kinds", "hero_tiny"])
        lines = buf.getvalue().splitlines()
        self.assertIn("(138 jp)", lines[0])
        self.assertIn("(183 jp)", lines[0])
        self.assertTrue(lines[2].startswith("| hero_tiny | 0.62 | 0.35 |"))


if __name__ == "__main__":
    unittest.main()
