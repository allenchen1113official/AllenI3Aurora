"""常聽 Podcast 重點筆記 · 引擎測試：python3 -m unittest scripts/ytnotes/test_podcast.py"""
import json, sys, tempfile, unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ytnotes as Y  # noqa: E402

TPE = timezone(timedelta(hours=8))
RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>x</title>
<item><title>2026/11/24(\xe4\xba\x8c) A</title><pubDate>Tue, 24 Nov 2026 00:30:00 GMT</pubDate><link>https://example.com/a</link>
  <enclosure url="https://cdn.example.com/a.mp3" type="audio/mpeg"/><itunes:duration>1865</itunes:duration><description><![CDATA[<p>A notes</p>]]></description></item>
<item><title>B same day earlier</title><pubDate>Mon, 23 Nov 2026 22:00:00 GMT</pubDate><link>https://example.com/b</link>
  <enclosure url="https://cdn.example.com/b.mp3"/><itunes:duration>00:50:00</itunes:duration></item>
<item><title>C yesterday</title><pubDate>Mon, 23 Nov 2026 00:30:00 GMT</pubDate><link>https://example.com/c</link>
  <enclosure url="https://cdn.example.com/c.mp3"/></item>
<item><title>D old</title><pubDate>Fri, 20 Nov 2026 00:30:00 GMT</pubDate><enclosure url="https://cdn.example.com/d.mp3"/></item>
<item><title>no audio</title><pubDate>Tue, 24 Nov 2026 01:00:00 GMT</pubDate></item>
</channel></rss>"""
SHOW = {"show": "游庭皓的財經皓角", "code": "yutinghao", "feed": "https://f", "lang": "zh", "page": "https://p"}


class ParseTest(unittest.TestCase):
    def test_parse_rss_sorted_with_audio_only(self):
        items = Y.parse_rss(RSS)
        self.assertEqual([i["title"][-1] for i in items], ["A", "r", "y", "d"])     # 無音檔的略過、新到舊
        self.assertEqual(items[0]["duration_sec"], 1865)
        self.assertEqual(items[1]["duration_sec"], 3000)
        self.assertIn("A notes", items[0]["description"])

    def test_pick_latest_per_taipei_day(self):
        items = Y.parse_rss(RSS)
        now = datetime(2026, 11, 24, 12, 0, tzinfo=TPE)
        eps = Y.pick_episodes(SHOW, items, now, set(), max_age_h=36)
        # 台北 11/24：A（08:30）與 B（06:00）同一天 → 只取最新的 A；台北 11/23 的 C 也在 36 小時內
        self.assertEqual([e["id"] for e in eps], ["yutinghao-20261123", "yutinghao-20261124"])
        a = eps[-1]
        self.assertEqual(a["title"][-1], "A")
        self.assertEqual(a["published"], "2026-11-24")
        self.assertEqual(a["lang"], "zh")
        self.assertEqual(a["url"], "https://example.com/a")
        # 已做過的不重排；時間窗外的舊集不灌入
        self.assertEqual(Y.pick_episodes(SHOW, items, now, {"yutinghao-20261124", "yutinghao-20261123"}), [])
        self.assertEqual(len(Y.pick_episodes(SHOW, items, now, set(), max_age_h=12)), 1)

    def test_merge_shows_remote_overrides(self):
        feeds = [{"code": "a", "feed": "https://a", "notes": True}, {"code": "b", "feed": "https://b", "notes": False},
                 {"code": "c", "feed": "https://c", "notes": True}, {"code": "d", "feed": "", "notes": True}]
        remote = Y.parse_remote_shows({"fields": {"items": {"arrayValue": {"values": [
            {"mapValue": {"fields": {"code": {"stringValue": "a"}, "enabled": {"booleanValue": False}}}},
            {"mapValue": {"fields": {"code": {"stringValue": "b"}, "enabled": {"booleanValue": True}}}}]}}}})
        self.assertEqual(remote, {"a": {"enabled": False}, "b": {"enabled": True}})
        self.assertEqual([s["code"] for s in Y.merge_shows(feeds, remote)], ["b", "c"])   # d 沒有 RSS 略過

    def test_parse_duration(self):
        self.assertEqual(Y.parse_duration("1:02:03"), 3723)
        self.assertEqual(Y.parse_duration("45"), 45)
        self.assertEqual(Y.parse_duration("abc"), 0)


class BatchTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        root, home = base / "youtube", base / "home"
        for p in (root / "_engine", root / "_inbox", home / "tmp"):
            p.mkdir(parents=True)
        self.patches = [mock.patch.object(Y, "ROOT", root), mock.patch.object(Y, "ENGINE", root / "_engine"),
                        mock.patch.object(Y, "INBOX", root / "_inbox"), mock.patch.object(Y, "HOME", home),
                        mock.patch.object(Y, "TMP", home / "tmp"), mock.patch.dict(Y.CFG, {"podcast_root": ""})]
        for p in self.patches: p.start()
        self.base = base

    def tearDown(self):
        for p in self.patches: p.stop()
        self.tmp.cleanup()

    def test_podroot_follows_root(self):
        self.assertEqual(Y.podroot(), self.base / "podcast")

    def ep(self, eid):
        return {"id": eid, "code": eid.rsplit("-", 1)[0], "show": "S", "title": "T", "url": "https://x", "audio_url": "https://x/a.mp3",
                "published": "2026-11-24", "duration_sec": 60, "lang": "zh"}

    def test_failed_episode_retried_once_then_given_up(self):
        Y.write_podq([self.ep("show-20261124")])
        def boom(ep, force=False):
            d = Y.podinbox() / ep["id"]; d.mkdir(parents=True, exist_ok=True)
            (d / "status.json").write_text(json.dumps({"state": "failed"}))
            raise RuntimeError("下載失敗")
        with mock.patch.object(Y, "cmd_podscan", lambda: 0), mock.patch.object(Y, "draft_podcast", boom):
            self.assertEqual(Y._run_podcast_batch(5), 1)
            self.assertEqual(Y.read_podq(), [])
            self.assertNotIn("show-20261124", Y.pod_done_ids())          # 第一次失敗：可再排一次
            self.assertFalse((Y.podinbox() / "show-20261124").exists())
            Y.write_podq([self.ep("show-20261124")])
            Y._run_podcast_batch(5)
            self.assertIn("show-20261124", Y.pod_done_ids())             # 第二次失敗：放棄，保留失敗紀錄供面板顯示
            self.assertTrue((Y.podinbox() / "show-20261124" / "status.json").exists())
        self.assertIn("podcast:show-20261124", (Y.ENGINE / "failed.txt").read_text(encoding="utf-8"))

    def test_success_marks_done_and_progress_lists_podcast(self):
        Y.write_podq([self.ep("show-20261124")])
        def ok(ep, force=False):
            d = Y.podinbox() / ep["id"]; d.mkdir(parents=True, exist_ok=True)
            (d / "meta.json").write_text(json.dumps({"title": "T", "author": "S", "url": "https://x"}))
            (d / "status.json").write_text(json.dumps({"state": "drafted", "at": "2026-11-24T10:00:00+08:00"}))
        with mock.patch.object(Y, "cmd_podscan", lambda: 0), mock.patch.object(Y, "draft_podcast", ok):
            Y._run_podcast_batch(5)
        self.assertIn("show-20261124", Y.pod_done_ids())
        items = Y.build_progress()["items"]
        it = next(x for x in items if x["id"] == "show-20261124")
        self.assertEqual((it["state"], it["url"], it["author"]), ("drafted", "https://x", "S"))

    def test_failed_podcast_without_meta_has_no_youtube_url(self):
        d = Y.podinbox() / "show-20261124"; d.mkdir(parents=True)
        (d / "status.json").write_text(json.dumps({"state": "failed", "error": "x"}))
        it = next(x for x in Y.build_progress()["items"] if x["id"] == "show-20261124")
        self.assertEqual(it["url"], "")


if __name__ == "__main__":
    unittest.main()
