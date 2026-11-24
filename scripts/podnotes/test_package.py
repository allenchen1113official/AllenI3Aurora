"""常聽 Podcast 重點筆記 · 送審包測試：python3 -m unittest scripts/podnotes/test_package.py"""
import copy as cp, sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_package as M  # noqa: E402

META = {"id": "yutinghao-20261124", "code": "yutinghao", "show": "游庭皓的財經皓角",
        "title": "2026/11/24(二)黃仁勳閃電回鍋!輝達狂飆31% 現在買股 還來得及嗎?【早晨財經速解讀】",
        "url": "https://soundcloud.com/x", "published": "2026-11-24", "duration_sec": 1865}
NOTE = {"headline": "輝達一週狂飆 31%，3 個訊號告訴你：AI 行情是回檔還是泡沫？",
        "summary": ["a", "b", "c"],
        "cornell": {"rows": [{"cue": f"c{i}", "note": f"n{i}"} for i in range(4)], "summary": "總結"},
        "posts": {"fb": "FB 文案" * 20, "ig": "IG 文案" * 20, "threads": "Threads 文案" * 10},
        "hashtags": ["台股", "#輝達"]}


class PackageTest(unittest.TestCase):
    def build(self, note=NOTE, meta=META):
        c, slash = M.build_copy(meta, note, "20261124")
        return c, M.validate(c, slash, note, meta)

    def test_valid_package(self):
        c, errs = self.build()
        self.assertEqual(errs, [])
        site = "https://allenchen1113official.github.io/AllenI3Aurora/podcast.html?pn=yutinghao-20261124#pn-yutinghao-20261124"
        self.assertIn(site, c["fb"]); self.assertIn(site, c["th"])
        self.assertNotIn("http", c["ig"])                          # IG 內文連結不能點，不放網址
        for k in c:
            self.assertIn("2026/11/24", c[k]); self.assertIn(M.BRAND, c[k]); self.assertIn("節目來源", c[k])
        self.assertIn("#台股 #輝達 #艾倫極光報報 #Podcast重點筆記", c["fb"])
        self.assertIn("〈黃仁勳閃電回鍋!輝達狂飆31% 現在買股 還來得及嗎?〉", c["th"])   # 短版來源用清理後的標題

    def test_clean_title(self):
        self.assertEqual(M.clean_title(META["title"]), "黃仁勳閃電回鍋!輝達狂飆31% 現在買股 還來得及嗎?")
        self.assertEqual(M.clean_title("EP490 – ReAct、CodeAct 怎麼選？"), "EP490 – ReAct、CodeAct 怎麼選？")

    def test_rejects_missing_or_identical_posts_and_long_threads(self):
        n = cp.deepcopy(NOTE); n["posts"] = {"fb": "同樣" * 30, "ig": "同樣" * 30, "threads": "同樣" * 30}
        self.assertTrue(any("不可相同" in e for e in self.build(n)[1]))
        n = cp.deepcopy(NOTE); del n["posts"]["ig"]
        self.assertTrue(any("posts.ig" in e for e in self.build(n)[1]))
        n = cp.deepcopy(NOTE); n["posts"]["threads"] = "長" * 400
        self.assertTrue(any(e.startswith("threads：") for e in self.build(n)[1]))

    def test_rejects_bad_structure(self):
        n = cp.deepcopy(NOTE); n["cornell"]["rows"] = n["cornell"]["rows"][:2]; n["summary"] = ["a"]
        errs = self.build(n)[1]
        self.assertTrue(any("康乃爾筆記應 4～6 列" in e for e in errs))
        self.assertTrue(any("重點摘要應 3～5 行" in e for e in errs))
        n = cp.deepcopy(NOTE); n["posts"]["ig"] = "看這裡 https://x.com " * 5
        self.assertTrue(any(e.startswith("ig：IG 內文連結") for e in self.build(n)[1]))
        m = dict(META, id="Bad_ID")
        self.assertTrue(any("meta.id" in e for e in self.build(NOTE, m)[1]))


if __name__ == "__main__":
    unittest.main()
