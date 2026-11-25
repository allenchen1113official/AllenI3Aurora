"""後台「筆記影片」清單：文件解析、併入佇列、撤回、重試、離線不動作
執行：python3 -m unittest scripts/ytnotes/test_videos.py"""
import json, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ytnotes as Y  # noqa: E402
from test_channels import fs_doc  # noqa: E402

A, B, C = "aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"
W = lambda k: f"https://www.youtube.com/watch?v={k}"


class R:
    def __init__(self, b): self.b = b
    def read(self): return self.b
    def __enter__(self): return self
    def __exit__(self, *a): return False


class VideoListTests(unittest.TestCase):
    def test_parse(self):
        doc = fs_doc([{"url": W(A), "note": "x"}, {"url": f"https://youtu.be/{A}?t=3"}, {"url": "https://example.com/x"},
                      {"url": f"https://www.youtube.com/shorts/{B}", "retry": "2026-11-25T01:00:00Z"}, "壞資料"])
        out = Y.parse_remote_videos(doc)
        self.assertEqual([(v["id"], v["retry"]) for v in out], [(A, ""), (B, "2026-11-25T01:00:00Z")])
        self.assertEqual(Y.parse_remote_videos({}), [])

    def test_plan_add_skip_done_and_dedupe_queue(self):
        remote = [{"id": A, "url": W(A)}, {"id": B, "url": W(B)}, {"id": C, "url": W(C)}]
        q, st, added, removed = Y.plan_remote_videos(remote, {}, [f"https://youtu.be/{B}"], lambda k: k == C)
        self.assertEqual(q, [f"https://youtu.be/{B}", W(A)])           # B 已在佇列（別的來源）、C 做過 → 只排 A
        self.assertEqual((added, removed), ([A], []))
        self.assertEqual([st[k]["queued"] for k in (A, B, C)], [True, False, False])
        # 再跑一次：不重複排
        q2, st2, added2, _ = Y.plan_remote_videos(remote, st, [], lambda k: False)
        self.assertEqual((q2, added2, st2), ([], [], st))

    def test_plan_remove_only_own_pending(self):
        state = {A: {"url": W(A), "queued": True}, B: {"url": W(B), "queued": False}, C: {"url": W(C), "queued": True}}
        q, st, added, removed = Y.plan_remote_videos([], state, [W(A), W(B)], lambda k: False)
        self.assertEqual(q, [W(B)])                                     # A 是後台排的且未開始 → 撤回；B 是頻道掃描排的 → 不動
        self.assertEqual((removed, st), ([A], {}))                      # C 已不在佇列（做完或進行中）→ 只清紀錄

    def test_plan_retry(self):
        state = {A: {"url": W(A), "queued": True}}
        r = [{"id": A, "url": W(A), "retry": "t1"}]
        q, st, added, _ = Y.plan_remote_videos(r, state, [], lambda k: False)
        self.assertEqual((q, added, st[A]["retry"]), ([W(A)], [A], "t1"))
        q, _, added, _ = Y.plan_remote_videos(r, st, [], lambda k: False)          # 同一個 retry 不再排
        self.assertEqual((q, added), ([], []))
        q, _, added, _ = Y.plan_remote_videos([{"id": A, "url": W(A), "retry": "t2"}], st, [], lambda k: True)
        self.assertEqual((q, added), ([], []))                                     # 已有完成的草稿 → 不重做

    def test_sync_end_to_end(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "_inbox" / "_done" / C).mkdir(parents=True)
            (root / "_inbox" / B).mkdir()
            (root / "_inbox" / B / "status.json").write_text('{"state": "failed"}')
            with mock.patch.object(Y, "ENGINE", root), mock.patch.object(Y, "INBOX", root / "_inbox"), mock.patch.object(Y, "log"):
                body = json.dumps(fs_doc([{"url": W(A)}, {"url": W(B)}, {"url": W(C)}])).encode()
                with mock.patch.object(Y.urllib.request, "urlopen", return_value=R(body)):
                    Y.sync_remote_videos()
                self.assertEqual(Y.read_queue(), [W(A), W(B)])          # 失敗過的 B 可再排；已送審的 C 不排
                with mock.patch.object(Y.urllib.request, "urlopen", side_effect=OSError("offline")):
                    Y.sync_remote_videos()
                self.assertEqual(Y.read_queue(), [W(A), W(B)])          # 離線：不撤回
                err = Y.urllib.error.HTTPError("u", 404, "nf", {}, None)
                with mock.patch.object(Y.urllib.request, "urlopen", side_effect=err):
                    Y.sync_remote_videos()
                self.assertEqual(Y.read_queue(), [])                    # 清單不存在＝空清單 → 撤回尚未開始的
                with mock.patch.dict(Y.CFG, {"videos_url": ""}), mock.patch.object(Y.urllib.request, "urlopen") as u:
                    Y.sync_remote_videos(); u.assert_not_called()


if __name__ == "__main__":
    unittest.main()
