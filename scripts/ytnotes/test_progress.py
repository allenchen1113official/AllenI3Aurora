"""進度檔 progress.json：內容組成、心跳、run 流程、與執行中 run 的鎖協調
執行：python3 -m unittest scripts/ytnotes/test_progress.py"""
import fcntl, json, subprocess, sys, tempfile, time, unittest
from datetime import timedelta
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ytnotes as Y  # noqa: E402


def wjson(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name) / "youtube"
        home = Path(self.tmp.name) / "home"
        (root / "_engine").mkdir(parents=True); (root / "_inbox" / "_done").mkdir(parents=True); home.mkdir()
        self.patches = [mock.patch.object(Y, "ROOT", root), mock.patch.object(Y, "ENGINE", root / "_engine"),
                        mock.patch.object(Y, "INBOX", root / "_inbox"), mock.patch.object(Y, "HOME", home),
                        mock.patch.object(Y, "TMP", home / "tmp"),
                        mock.patch.dict(Y.CFG, {"podcast_feeds_url": "", "podcast_root": "", "videos_url": ""})]   # 測試不連網、不碰真實 notes/podcast
        for p in self.patches: p.start()
        self.root, self.home = root, home
        Y.RUN.update(state="idle", startedAt=None, endedAt=None, processed=0); Y.CUR.clear()

    def tearDown(self):
        for p in self.patches: p.stop()
        Y.RUN.update(state="idle", startedAt=None, endedAt=None, processed=0); Y.CUR.clear()
        self.tmp.cleanup()

    def progress(self):
        return json.loads((self.root / "_engine" / "progress.json").read_text(encoding="utf-8"))


class BuildProgressTests(Base):
    def test_items_order_states_and_cutoffs(self):
        now = Y.now_tpe()
        inbox, eng = self.root / "_inbox", self.root / "_engine"
        Y.write_queue(["https://www.youtube.com/watch?v=AAAAAAAAAAA", "https://www.youtube.com/watch?v=FFFFFFFFFFF"])
        # 佇列中但之前失敗過（收件匣留有 meta）→ 顯示「排隊中」且帶標題、不帶舊錯誤
        wjson(inbox / "FFFFFFFFFFF" / "meta.json", {"title": "重試的影片", "author": "甲"})
        wjson(inbox / "FFFFFFFFFFF" / "status.json", {"state": "failed", "error": "HTTP 403"})
        wjson(inbox / "DDDDDDDDDDD" / "meta.json", {"title": "草稿好了", "author": "乙", "duration_sec": 1687, "draft_seconds": 201,
                                                    "language": "en", "transcriber": "YouTube 人工字幕（en）"})
        wjson(inbox / "DDDDDDDDDDD" / "status.json", {"state": "drafted", "at": now.isoformat(timespec="seconds")})
        (inbox / "DDDDDDDDDDD" / "draft.md").write_text("[00:00] 逐字稿內容不可外流", encoding="utf-8")
        wjson(inbox / "XXXXXXXXXXX" / "status.json", {"state": "failed", "error": "e" * 2000, "at": now.isoformat(timespec="seconds")})
        recent = (now - timedelta(days=1)).isoformat(timespec="seconds")
        old = (now - timedelta(days=30)).isoformat(timespec="seconds")
        wjson(inbox / "_done" / "NEWDONE0000" / "status.json", {"state": "done", "at": recent, "package": "20261123/pilotone/NEWDONE0000"})
        wjson(inbox / "_done" / "OLDDONE0000" / "status.json", {"state": "done", "at": old})
        (eng / "failed.txt").write_text(
            f"{(now - timedelta(days=9)):%Y-%m-%d %H:%M}\thttps://youtu.be/OLDFAIL0000\t舊錯\n"
            f"{now:%Y-%m-%d %H:%M}\thttps://youtu.be/NEWFAIL0000\tyt-dlp 失敗（1）\n", encoding="utf-8")
        (eng / "run.log").write_text("".join(f"line {i}\n" for i in range(30)), encoding="utf-8")
        Y.CUR.update(id="AAAAAAAAAAA", url="https://www.youtube.com/watch?v=AAAAAAAAAAA", title="正在轉", stage="transcribe",
                     startedAt="2026-11-24T10:00:00+08:00", stageAt="2026-11-24T10:01:00+08:00")

        p = Y.build_progress()
        states = [(x["id"], x["state"]) for x in p["items"]]
        self.assertEqual(states, [("AAAAAAAAAAA", "processing"), ("FFFFFFFFFFF", "queued"), ("DDDDDDDDDDD", "drafted"),
                                  ("XXXXXXXXXXX", "failed"), ("NEWDONE0000", "done")])
        self.assertEqual(p["items"][0]["stageLabel"], "轉錄中")
        self.assertEqual(p["current"]["stageLabel"], "轉錄中")
        self.assertEqual(p["items"][1]["title"], "重試的影片")
        self.assertNotIn("error", p["items"][1])
        d = p["items"][2]
        self.assertEqual((d["durationSec"], d["draftSeconds"], d["lang"]), (1687, 201, "en"))
        self.assertLessEqual(len(p["items"][3]["error"]), 300)
        self.assertEqual(p["items"][4]["package"], "20261123/pilotone/NEWDONE0000")
        self.assertEqual([q["id"] for q in p["queue"]], ["AAAAAAAAAAA", "FFFFFFFFFFF"])
        self.assertEqual([f["id"] for f in p["failures"]], ["NEWFAIL0000"])
        self.assertEqual(len(p["log"]), 12); self.assertEqual(p["log"][-1], "line 29")
        self.assertEqual(p["version"], 1)
        self.assertTrue(p["updatedAt"].endswith("+08:00"))
        self.assertNotIn("逐字稿內容", json.dumps(p, ensure_ascii=False))

    def test_empty_store(self):
        p = Y.build_progress()
        self.assertEqual((p["items"], p["queue"], p["failures"], p["current"]), ([], [], [], None))
        self.assertEqual(p["engine"]["state"], "idle")


class HeartbeatTests(Base):
    def test_long_command_refreshes_progress_while_running(self):
        Y.RUN["state"] = "running"
        Y.CUR.update(id="AAAAAAAAAAA", stage="transcribe")
        calls = []
        with mock.patch.object(Y, "HEARTBEAT_SEC", 0.2), mock.patch.object(Y, "write_progress", lambda: calls.append(time.time())):
            r = Y.sh([sys.executable, "-c", "import time; time.sleep(0.9); print('ok')"])
        self.assertEqual(r.stdout.strip(), "ok")
        self.assertGreaterEqual(len(calls), 2)

    def test_timeout_kills_and_raises(self):
        with mock.patch.object(Y, "HEARTBEAT_SEC", 0.2):
            with self.assertRaises(subprocess.TimeoutExpired):
                Y.sh([sys.executable, "-c", "import time; time.sleep(5)"], timeout=0.5)

    def test_failed_command_raises_runtime_error(self):
        with self.assertRaises(RuntimeError):
            Y.sh([sys.executable, "-c", "import sys; sys.exit(3)"])


class RunFlowTests(Base):
    def test_run_writes_running_stages_then_idle(self):
        urls = ["https://www.youtube.com/watch?v=AAAAAAAAAAA", "https://www.youtube.com/watch?v=BBBBBBBBBBB"]
        Y.write_queue(urls)
        (self.root / "_engine" / "last_scan.txt").write_text(Y.now_tpe().strftime("%Y%m%d"))   # 今天已掃過
        seen = []

        def fake_draft(url):
            k = Y.video_key(url)
            Y.CUR.clear(); Y.set_stage("transcribe", id=k, url=url, title="影片 " + k)
            seen.append(self.progress())
            wjson(self.root / "_inbox" / k / "meta.json", {"title": "影片 " + k})
            wjson(self.root / "_inbox" / k / "status.json", {"state": "drafted", "at": Y.now_tpe().isoformat(timespec="seconds")})
            Y.CUR.clear(); Y.write_progress()

        with mock.patch.object(Y, "draft", fake_draft):
            Y.cmd_run()
        first = seen[0]
        self.assertEqual(first["engine"]["state"], "running")
        self.assertEqual(first["current"]["id"], "AAAAAAAAAAA")
        self.assertEqual([x["state"] for x in first["items"]], ["processing", "queued"])
        self.assertEqual(seen[1]["engine"]["processed"], 1)
        self.assertEqual([x["state"] for x in seen[1]["items"]], ["processing", "drafted"])
        final = self.progress()
        self.assertEqual(final["engine"]["state"], "idle")
        self.assertEqual(final["engine"]["processed"], 2)
        self.assertTrue(final["engine"]["endedAt"])
        self.assertIsNone(final["current"])
        self.assertEqual(final["queue"], [])
        self.assertEqual(sorted(x["state"] for x in final["items"]), ["drafted", "drafted"])

    def test_failed_draft_is_logged_and_progress_stays_consistent(self):
        Y.write_queue(["https://www.youtube.com/watch?v=CCCCCCCCCCC"])
        (self.root / "_engine" / "last_scan.txt").write_text(Y.now_tpe().strftime("%Y%m%d"))

        def boom(url):
            Y.set_stage("download", id="CCCCCCCCCCC", url=url)
            wjson(self.root / "_inbox" / "CCCCCCCCCCC" / "status.json", {"state": "failed", "error": "HTTP 403"})
            Y.CUR.clear()
            raise RuntimeError("HTTP 403")

        with mock.patch.object(Y, "draft", boom):
            Y.cmd_run()
        p = self.progress()
        self.assertEqual(p["engine"]["state"], "idle")
        self.assertEqual([(x["id"], x["state"]) for x in p["items"]], [("CCCCCCCCCCC", "failed")])
        self.assertEqual([f["id"] for f in p["failures"]], ["CCCCCCCCCCC"])


class LockTests(Base):
    def test_manual_command_does_not_clobber_running_process(self):
        wjson(self.root / "_engine" / "progress.json", {"engine": {"state": "running"}})
        with open(self.home / "run.lock", "w") as held:          # 模擬 launchd 那個 run 正持有鎖
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            Y.cmd_add(["https://www.youtube.com/watch?v=EEEEEEEEEEE"])
        self.assertEqual(self.progress(), {"engine": {"state": "running"}})
        self.assertIn("EEEEEEEEEEE", (self.root / "_engine" / "queue.txt").read_text())
        Y.cmd_add(["https://www.youtube.com/watch?v=GGGGGGGGGGG"])   # 沒有人持鎖 → 正常寫入
        self.assertEqual([x["state"] for x in self.progress()["items"]], ["queued", "queued"])

    def test_concurrent_run_is_skipped_without_touching_progress(self):
        wjson(self.root / "_engine" / "progress.json", {"marker": 1})
        with open(self.home / "run.lock", "w") as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            Y.cmd_run()
        self.assertEqual(self.progress(), {"marker": 1})


if __name__ == "__main__":
    unittest.main()
