"""Tests for compare_runs.py on the checked-in fixtures (GATES.md section 5 numbers).

Run: python3 -m unittest discover -s scripts/acceptance/judge -v
"""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import aggregate  # noqa: E402
import compare_runs as cr  # noqa: E402
import fixture  # noqa: E402

FX = os.path.join(HERE, "fixtures")


def fx(name):
    return os.path.join(FX, name + ".json.gz")


def f2(x):
    return f"{aggregate.r2(x):.2f}"


JUSTSO = [fx("v01-justso")] + [fx(f"v02-justso-{i}") for i in (1, 2, 3)]


class JustSoProtocol(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runs = [cr.load_run(p) for p in JUSTSO]
        cls.res = cr.compare(cls.runs, groups={"fiction": ["just-so-three-tales"]})

    def test_run_means_and_strict_match_gates_section_5(self):
        by = {r["label"]: r for r in self.runs}
        self.assertEqual([f2(by[k]["mean"]) for k in ("v0.2-justso-1", "v0.2-justso-2", "v0.2-justso-3")],
                         ["3.44", "3.41", "3.40"])
        self.assertEqual([by[k]["strict"] for k in ("v0.2-justso-1", "v0.2-justso-2", "v0.2-justso-3")], [2, 1, 2])
        self.assertEqual((f2(by["v0.1.0-justso"]["mean"]), by["v0.1.0-justso"]["strict"]), ("3.38", 4))
        self.assertEqual([by[k]["pages"] for k in ("v0.1.0-justso", "v0.2-justso-1", "v0.2-justso-2", "v0.2-justso-3")],
                         [30, 34, 35, 29])

    def test_continuity_matches_gates(self):
        by = {r["label"]: r for r in self.runs}
        self.assertEqual(f2(by["v0.1.0-justso"]["criteria"]["continuity"]), "2.68")
        self.assertEqual([f2(by[f"v0.2-justso-{i}"]["criteria"]["continuity"]) for i in (1, 2, 3)],
                         ["2.59", "2.50", "2.64"])

    def test_cells_pool_and_spread(self):
        v2 = self.res["cells"]["just-so-three-tales"]["v0.2"]
        v1 = self.res["cells"]["just-so-three-tales"]["v0.1.0"]
        self.assertEqual((v2["runs"], v2["pages"], v2["strict"], v2["strict_per_run"]), (3, 98, 5, [2, 1, 2]))
        self.assertEqual([f2(x) for x in v2["spread"]], ["3.40", "3.44"])
        self.assertIsNone(v1["spread"])
        # pooled mean is page-weighted
        expect = sum(r["mean"] * r["pages"] for r in self.runs[1:]) / 98
        self.assertAlmostEqual(v2["mean"], expect, places=9)

    def test_pooled_defect_rates_are_counts_over_judge_pages(self):
        v2 = self.res["cells"]["just-so-three-tales"]["v0.2"]
        self.assertEqual(v2["judge_pages"], 294)
        self.assertAlmostEqual(v2["defect_rates"]["key_prop_not_drawn"],
                               sum(r["defect_rates"]["key_prop_not_drawn"] * r["judge_pages"] for r in self.runs[1:]) / 294, places=9)

    def test_delta_block(self):
        d = self.res["deltas"]["just-so-three-tales"]["v0.2"]
        self.assertEqual(d["from"], "v0.1.0")
        self.assertEqual(d["strict"], 1)  # 5 pooled against 4
        self.assertAlmostEqual(d["strict_per_run"], 5 / 3 - 4, places=9)
        self.assertLess(d["defect_rates"]["label_clutter"], -0.3)
        self.assertGreater(d["defect_rates"]["key_prop_not_drawn"], 0.1)
        self.assertEqual(self.res["group_deltas"]["fiction"]["v0.2"]["mean"], d["mean"])

    def test_markdown_has_the_blocks(self):
        md = cr.markdown(self.res)
        for part in ("## Runs", "## Per book and version", "## Delta against v0.1.0", "GROUP fiction",
                     "3.40-3.44", "2/1/2", "key prop not drawn", "hero a speck or cropped"):
            self.assertIn(part, md)


class FailedPagesAndGroups(unittest.TestCase):
    def test_failed_page_counts_as_zero_like_aggregate(self):
        run = cr.load_run(fx("v02-gate2"))
        self.assertEqual(run["failed_pages"], [42])
        self.assertEqual(run["pages"], 61)
        self.assertEqual((f2(run["mean"]), run["strict"]), ("3.55", 20))
        self.assertEqual(f2(run["criteria"]["continuity"]), "2.99")

    def test_gate2_rates_in_the_run_row(self):
        run = cr.load_run(fx("v02-gate2"))
        self.assertEqual([f2(run["defect_rates"][k]) for k in ("hero_tiny", "tail_wrong", "label_clutter", "repeat_variety")],
                         ["0.35", "0.11", "0.08", "0.08"])

    def test_aggregate_json_gives_failed_pages(self):
        judgments, _, _ = fixture.load(fx("v02-gate2"))
        with tempfile.TemporaryDirectory() as d:
            raw = os.path.join(d, "judgments.json")
            agg = os.path.join(d, "aggregate.json")
            with open(raw, "w") as f:
                json.dump(judgments, f)
            with open(agg, "w") as f:
                json.dump({"failed_pages": [42]}, f)
            run = cr.load_run({"file": raw, "label": "x", "version": "v", "book": "b", "aggregate": agg})
            self.assertEqual((run["failed_pages"], f2(run["mean"])), ([42], "3.55"))
            # without any status source page 42 still fails: every score is 0
            run2 = cr.load_run({"file": raw, "label": "x", "version": "v", "book": "b"})
            self.assertEqual(run2["failed_pages"], [42])

    def test_judge_dir_gives_failed_pages(self):
        judgments, _, _ = fixture.load(fx("v02-gate2"))
        with tempfile.TemporaryDirectory() as d:
            raw = os.path.join(d, "judgments.json")
            with open(raw, "w") as f:
                json.dump(judgments, f)
            os.makedirs(os.path.join(d, "judge"))
            with open(os.path.join(d, "judge", "page-07.json"), "w") as f:
                json.dump({"status": "failed"}, f)
            run = cr.load_run({"file": raw, "label": "x", "version": "v", "book": "b", "judge_dir": os.path.join(d, "judge")})
            self.assertEqual(run["failed_pages"], [7, 42])

    def test_two_books_group_and_unknown_book(self):
        runs = [cr.load_run(p) for p in (fx("v01-gate2b"), fx("v02-gate2"), fx("v01-gate1-flash"), fx("v02-gate1"))]
        res = cr.compare(runs, groups={"tales": ["happy-prince-two-tales", "happy-prince-and-other-tales"]})
        g1, g2 = res["group_cells"]["tales"]["v0.1"], res["group_cells"]["tales"]["v0.2"]
        self.assertEqual((g1["pages"], g2["pages"], g1["strict"], g2["strict"]), (82, 83, 14, 26))
        self.assertEqual(g2["failed"], 1)
        with self.assertRaises(ValueError):
            cr.compare(runs, groups={"x": ["no-such-book"]})

    def test_spec_parsing(self):
        self.assertEqual(cr.parse_spec("a/b.json"), {"file": "a/b.json"})
        self.assertEqual(cr.parse_spec("file=a.json,label=L,version=v0.3"), {"file": "a.json", "label": "L", "version": "v0.3"})
        with self.assertRaises(ValueError):
            cr.parse_spec("label=L")

    def test_cli_writes_md_and_json(self):
        with tempfile.TemporaryDirectory() as d:
            md, js = os.path.join(d, "c.md"), os.path.join(d, "c.json")
            args = [x for p in JUSTSO for x in ("--run", p)]
            cr.main(args + ["--group", "fiction=just-so-three-tales", "--out-md", md, "--out-json", js])
            data = json.load(open(js))
            self.assertEqual(data["schema"], cr.SCHEMA)
            self.assertEqual(data["base_version"], "v0.1.0")
            self.assertIn("GROUP fiction", open(md).read())


if __name__ == "__main__":
    unittest.main()
