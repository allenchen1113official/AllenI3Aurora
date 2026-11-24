"""常聽 Podcast 重點筆記 · 雲端管線測試：python3 -m unittest scripts/podnotes/test_pipeline.py（不連網、不碰 Firestore）"""
import json, sys, tempfile, unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as P  # noqa: E402

TPE = timezone(timedelta(hours=8))
RSS = b"""<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<item><title>A today</title><pubDate>Tue, 24 Nov 2026 00:30:00 GMT</pubDate><link>https://ex.com/a</link><enclosure url="https://cdn/a.mp3"/><itunes:duration>1800</itunes:duration></item>
<item><title>B yesterday</title><pubDate>Mon, 23 Nov 2026 00:30:00 GMT</pubDate><enclosure url="https://cdn/b.mp3"/></item>
</channel></rss>"""
SHOW = {"show": "游庭皓的財經皓角", "code": "yutinghao", "feed": "https://f", "lang": "zh", "notes": True}
NOW = datetime(2026, 11, 24, 12, 0, tzinfo=TPE)
META = {"id": "yutinghao-20261124", "code": "yutinghao", "show": "游庭皓的財經皓角", "title": "A today", "url": "https://ex.com/a",
        "audio_url": "https://cdn/a.mp3", "published": "2026-11-24", "duration_sec": 1800}
GOOD = {"corrections": [{"from": "輝打", "to": "輝達"}], "headline": "輝達一週狂飆 31%，3 個訊號告訴你：回檔還是泡沫？",
        "summary": ["a", "b", "c"], "cornell": {"rows": [{"cue": f"c{i}", "note": f"n{i}"} for i in range(4)], "summary": "總結"},
        "posts": {"fb": "FB 文案" * 20, "ig": "IG 文案" * 20, "threads": "Threads 文案" * 10}, "hashtags": ["#台股"], "category": "理財", "check": []}


class PlanTest(unittest.TestCase):
    def run_plan(self, states, **kw):
        with mock.patch.object(P, "fetch", lambda url, timeout=60: RSS):
            return [(e["id"], act) for e, act in P.plan([SHOW], states, NOW, **kw)]

    def test_latest_day_only(self):
        self.assertEqual(self.run_plan({}), [("yutinghao-20261124", "transcribe")])    # 昨天那集不補做

    def test_stage_decides_action(self):
        self.assertEqual(self.run_plan({"yutinghao-20261124": {"stage": "noted"}}), [])
        self.assertEqual(self.run_plan({"yutinghao-20261124": {"stage": "transcribed", "transcript": "x"}}), [("yutinghao-20261124", "note")])
        self.assertEqual(self.run_plan({"yutinghao-20261124": {"stage": "failed", "attempts": 1}}), [("yutinghao-20261124", "transcribe")])
        self.assertEqual(self.run_plan({"yutinghao-20261124": {"stage": "failed", "attempts": 2}}), [])
        self.assertEqual(self.run_plan({"yutinghao-20261124": {"stage": "noted"}}, force=True), [("yutinghao-20261124", "transcribe")])

    def test_enabled_shows_remote_overrides_feeds(self):
        codes = [s["code"] for s in P.enabled_shows(None)]
        self.assertEqual(sorted(codes), ["ailanren", "yutinghao", "zhaohua"])
        codes = [s["code"] for s in P.enabled_shows({"items": [{"code": "zhaohua", "enabled": False}, {"code": "gooaye", "enabled": True}]})]
        self.assertEqual(sorted(codes), ["ailanren", "gooaye", "yutinghao"])


class NoteTest(unittest.TestCase):
    def test_parse_json_tolerates_fences(self):
        self.assertEqual(P.parse_json('```json\n{"a": 1}\n```'), {"a": 1})
        self.assertEqual(P.parse_json('好的：{"a": {"b": 2}} 以上'), {"a": {"b": 2}})
        with self.assertRaises(ValueError):
            P.parse_json("沒有 JSON")

    def test_apply_corrections_only_existing_and_safe(self):
        t, n = P.apply_corrections("[00:00] 輝打大漲，台雞電也漲。", [{"from": "輝打", "to": "輝達"}, {"from": "台雞電", "to": "台積電"},
                                    {"from": "不存在", "to": "x"}, {"from": "漲", "to": "跌"}, {"from": "大漲", "to": "a\nb"}])
        self.assertEqual(t, "[00:00] 輝達大漲，台積電也漲。")
        self.assertEqual(n, 2)                                     # 單字、換行、不存在的都不套用

    def test_write_note_retries_with_errors_then_passes(self):
        bad = dict(GOOD, posts={"fb": "同" * 50, "ig": "同" * 50, "threads": "同" * 50})
        calls = []
        def fake(system, user, key, model, max_tokens=8000):
            calls.append(user)
            return json.dumps(bad if len(calls) == 1 else GOOD, ensure_ascii=False), {"input_tokens": 10, "output_tokens": 5}
        with mock.patch.object(P, "call_claude", fake):
            note = P.write_note(META, "[00:00] 輝打", "k", "m")
        self.assertEqual(note["headline"], GOOD["headline"])
        self.assertEqual(len(calls), 2)
        self.assertIn("不可相同", calls[1])                         # 第二次帶著驗證錯誤重寫
        self.assertIn("<逐字稿>", calls[0])

    def test_write_note_gives_up_after_three(self):
        with mock.patch.object(P, "call_claude", lambda *a, **k: ("不是 JSON", {})):
            with self.assertRaises(RuntimeError):
                P.write_note(META, "x", "k", "m")

    def test_long_transcript_truncated_for_model(self):
        msg = P.user_message(META, "字" * (P.LLM_CHARS + 500))
        self.assertIn("已截斷", msg)
        self.assertLess(len(msg), P.LLM_CHARS + 1000)


class IndexTest(unittest.TestCase):
    def test_merge_index_replaces_and_prunes_cards(self):
        tmp = Path(tempfile.mkdtemp())
        data, cards = tmp / "podnotes.json", tmp / "cards"
        cards.mkdir()
        (cards / "old-20260101_IG.png").write_bytes(b"x")
        (cards / "yutinghao-20261124_IG.png").write_bytes(b"x")
        with mock.patch.object(P, "DATA", data), mock.patch.object(P, "CARDS", cards), mock.patch.object(P, "MAX_ITEMS", 2):
            data.write_text(json.dumps({"items": [{"id": "old-20260101", "added": "20260101", "cards": {"ig": "assets/podnotes/old-20260101_IG.png"}},
                                                  {"id": "x-20260102", "added": "20260102", "cards": {}}]}), encoding="utf-8")
            e = P.slim_entry({"id": "yutinghao-20261124", "published": "2026-11-24", "added": "20261124", "summary": ["a"] * 9,
                              "cornell": {"rows": [{"cue": "c", "note": "n"}], "summary": "s"}, "url": "javascript:x", "transcript": "不可外流"},
                             {"fb": "", "ig": "assets/podnotes/yutinghao-20261124_IG.png"})
            P.merge_index(e)
            d = json.loads(data.read_text(encoding="utf-8"))
        self.assertEqual([x["id"] for x in d["items"]], ["yutinghao-20261124", "x-20260102"])
        it = d["items"][0]
        self.assertEqual((it["date"], it["url"], len(it["summary"])), ("2026.11.24", "", 5))
        self.assertNotIn("transcript", json.dumps(d, ensure_ascii=False))
        self.assertEqual(sorted(f.name for f in cards.iterdir()), ["yutinghao-20261124_IG.png"])


class AsrTest(unittest.TestCase):
    def test_plan_carries_show_asr_and_dicts_exist(self):
        show = dict(SHOW, asr="whisper")
        with mock.patch.object(P, "fetch", lambda url, timeout=60: RSS):
            ep, act = P.plan([show], {}, NOW)[0]
        self.assertEqual(ep["asr"], "whisper")
        reps = P.load_replace()
        self.assertIn(("趙懷古惑仔", "兆華與股惑仔"), reps)
        self.assertTrue((P.HERE / "dict" / "熱詞.txt").exists())


class ChunkTest(unittest.TestCase):
    def test_offset_segs_shifts_time_and_drops_speaker(self):
        out = P.offset_segs([{"start": 1.5, "end": 3, "text": "a", "spk": 0}], 600)
        self.assertEqual(out, [{"start": 601.5, "end": 603.0, "text": "a", "spk": None}])

    def test_sh_reports_oom_kill(self):
        with self.assertRaises(RuntimeError) as cm:
            P.sh([sys.executable, "-c", "import os,signal; os.kill(os.getpid(), signal.SIGKILL)"])
        self.assertIn("記憶體不足", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
