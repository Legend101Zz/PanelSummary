"""Unit tests for aggregate.py and the judge prompt. Run: python3 -m unittest discover -s scripts/acceptance/judge"""
import json
import os
import re
import unittest

import aggregate as ag

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
C = ag.CRITERIA


def sc(*vals):
    return dict(zip(C, vals))  # order: leg, flow, speaker, continuity, variety, turn, fidelity, beat


def J(judge, page, scores, ships, defects=()):
    return {"judge": judge, "page": page, "scores": scores, "ships": ships, "what_works": "", "defects": list(defects)}


def D(owner, sev):
    return {"owner": owner, "severity": sev, "what": "w", "fix": "f"}


# Hand-computed fixture: 2 judges, 2 pages.
FIX = [
    J(1, 1, sc(4, 4, 4, 4, 4, 4, 4, 4), True, [D("writer", "major")]),
    J(2, 1, sc(5, 4, 4, 3, 4, 4, 5, 4), True, [D("renderer", "blocker")]),
    J(1, 2, sc(3, 3, 3, 2, 3, 3, 3, 3), False, [D("writer", "minor")]),
    J(2, 2, sc(3, 4, 3, 2, 3, 3, 2, 3), True),
]


class AggregateTest(unittest.TestCase):
    def test_hand_computed(self):
        r = ag.aggregate(FIX, page_section={1: "s1", 2: "s2"})
        p1, p2 = r["page_rows"]
        # page 1 panel: 4.5 4 4 3.5 4 4 4.5 4 -> sum 32.5 -> 4.0625
        self.assertEqual(p1["panel"]["legibility"], 4.5)
        self.assertEqual(p1["panel"]["continuity"], 3.5)
        self.assertAlmostEqual(p1["mean"], 4.0625)
        self.assertTrue(p1["ships_strict"] and p1["ships_majority"])
        # page 2 panel: 3 3.5 3 2 3 3 2.5 3 -> sum 23 -> 2.875
        self.assertAlmostEqual(p2["mean"], 2.875)
        self.assertFalse(p2["ships_strict"])
        self.assertFalse(p2["ships_majority"])  # 1 of 2 is not a majority
        self.assertEqual(r["ships_strict"], 1)
        self.assertAlmostEqual(r["overall"], 3.46875)
        self.assertAlmostEqual(r["criteria"]["legibility"], 3.75)
        self.assertAlmostEqual(r["criteria"]["continuity"], 2.75)
        self.assertAlmostEqual(r["criteria"]["fidelity"], 3.5)
        self.assertEqual(r["pages_below_3"]["continuity"], [2])
        self.assertEqual(r["pages_below_3"]["fidelity"], [2])
        self.assertEqual(r["pages_below_3"]["legibility"], [])
        self.assertEqual(r["defects"]["total"], 3)
        self.assertEqual(r["defects"]["per_judge"], 1.5)
        self.assertEqual(r["defects"]["by_owner"]["writer"], 2)
        self.assertEqual(r["defects"]["blockers_by_owner"]["renderer"], 1)
        self.assertEqual(r["sections"]["s2"]["overall"], 2.875)
        self.assertEqual(r["judges"], 2)

    def test_strict_bar(self):
        self.assertTrue(ag.meets_strict_bar(sc(4, 4, 3, 3, 4, 4, 4, 4)))
        self.assertFalse(ag.meets_strict_bar(sc(3, 5, 5, 5, 5, 5, 5, 5)))  # legibility < 4
        self.assertFalse(ag.meets_strict_bar(sc(5, 5, 5, 5, 5, 5, 3, 5)))  # fidelity < 4
        self.assertFalse(ag.meets_strict_bar(sc(4, 4, 2, 5, 5, 5, 4, 5)))  # a criterion < 3
        self.assertFalse(ag.meets_strict_bar(sc(4, 3, 3, 3, 3, 3, 4, 3)))  # mean < 3.5

    def test_failed_page_counts_as_zero(self):
        j = FIX + [J(1, 3, sc(0, 0, 0, 0, 0, 0, 0, 0), False), J(2, 3, sc(5, 5, 5, 5, 5, 5, 5, 5), True)]
        r = ag.aggregate(j, statuses={1: "accepted", 2: "accepted", 3: "failed"})
        p3 = r["page_rows"][2]
        self.assertTrue(p3["failed"] and not p3["ships_strict"] and not p3["ships_majority"])
        self.assertEqual(p3["mean"], 0)
        self.assertEqual(r["failed_pages"], [3])
        self.assertAlmostEqual(r["overall"], (4.0625 + 2.875 + 0) / 3)
        self.assertAlmostEqual(r["accepted_only"]["overall"], 3.46875)

    def test_compare_gate(self):
        base = ag.aggregate(FIX)
        better = json.loads(json.dumps(base))
        better["ships_strict"] += 1
        better["overall"] = 3.5
        better["criteria"]["continuity"] = 2.6
        c = ag.compare(better, base)
        self.assertTrue(c["checks"]["ship_bar_pages_above_baseline"]["pass"])
        self.assertTrue(c["gate2_pass"])
        worse = json.loads(json.dumps(better))
        worse["criteria"]["fidelity"] = base["criteria"]["fidelity"] - 0.25
        c = ag.compare(worse, base)
        self.assertEqual(c["checks"]["no_criterion_more_than_0.2_below_baseline"]["failing"], ["fidelity"])
        self.assertFalse(c["gate2_pass"])
        same = ag.compare(base, base)  # not above baseline: fails
        self.assertFalse(same["gate2_pass"])

    def test_single_judge_without_judge_key(self):
        raw = [{"page": 1, "scores": sc(4, 4, 4, 4, 4, 4, 4, 4), "ships": True, "what_works": "", "defects": []}]
        r = ag.aggregate(ag.load_judgments(raw))
        self.assertEqual(r["judges"], 1)
        self.assertEqual(r["ships_strict"], 1)

    def test_markdown_runs(self):
        r = ag.aggregate(FIX, page_section={1: "s1", 2: "s1"})
        r["comparison"] = ag.compare(r, r)
        self.assertIn("Gate 2", ag.markdown(r))


class PromptTest(unittest.TestCase):
    def test_prompt_md_equals_script(self):
        src = open(os.path.join(HERE, "judge-workflow.js"), encoding="utf-8").read()
        m = re.search(r"const PROMPT_TEMPLATE = `(.*?)`\n", src, re.S)
        self.assertIsNotNone(m)
        md = open(os.path.join(HERE, "prompt.md"), encoding="utf-8").read()
        self.assertEqual(m.group(1), md.rstrip("\n"))


class BaselineTest(unittest.TestCase):
    """The committed run-8 baseline must equal the numbers in docs/rebuild/ACCEPTANCE.md."""

    def test_run8_numbers(self):
        path = os.path.join(ROOT, "docs", "rebuild", "baselines", "run8.json")
        if not os.path.exists(path):
            self.skipTest("baseline not present")
        b = json.load(open(path))
        self.assertEqual((b["pages"], b["ships_strict"], b["ships_majority"]), (46, 5, 5))
        self.assertEqual(round(b["overall"], 2), 3.38)  # exact 3.375; ACCEPTANCE.md truncates to 3.37
        self.assertEqual(int(b["overall"] * 100) / 100, 3.37)
        want = {"reading_flow": 4.41, "speaker_attribution": 3.83, "variety": 3.57, "page_turn": 3.43,
                "legibility": 3.30, "beat_without_prose_wall": 3.09, "fidelity": 2.93, "continuity": 2.43}
        for k, v in want.items():
            self.assertEqual(round(b["criteria"][k], 2), v, k)
        self.assertEqual(b["defects"]["total"], 258)
        self.assertEqual(b["defects"]["by_owner"], {"writer": 133, "renderer": 93, "plan": 19, "understanding": 13})
        self.assertEqual([round(b["sections"][s]["overall"], 2) for s in ("s1", "s2", "s3", "s4", "s5")],
                         [3.24, 3.48, 3.06, 3.57, 3.46])


if __name__ == "__main__":
    unittest.main()
