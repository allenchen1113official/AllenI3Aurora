"""常看頻道清單：網址正規化、後台文件解析、與 channels.tsv 合併
執行：python3 -m unittest scripts/ytnotes/test_channels.py"""
import json, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ytnotes as Y  # noqa: E402


def fs_doc(items):
    def v(x):
        if isinstance(x, bool): return {"booleanValue": x}
        if isinstance(x, str): return {"stringValue": x}
        if isinstance(x, dict): return {"mapValue": {"fields": {k: v(y) for k, y in x.items()}}}
        if isinstance(x, list): return {"arrayValue": {"values": [v(y) for y in x]}}
        return {"nullValue": None}
    return {"name": "x", "fields": {"items": v(items), "updatedAt": {"timestampValue": "2026-11-23T02:00:00Z"}}}


class ChannelTests(unittest.TestCase):
    def test_channel_key(self):
        k = Y.channel_key
        self.assertEqual(k("https://www.youtube.com/@AIExplained/"), "https://www.youtube.com/@AIExplained/videos")
        self.assertEqual(k("https://m.youtube.com/@abc?si=1"), "https://www.youtube.com/@abc/videos")
        self.assertEqual(k("youtube.com/channel/UC123"), "https://www.youtube.com/channel/UC123/videos")
        self.assertEqual(k("@abc"), "https://www.youtube.com/@abc/videos")
        self.assertEqual(k("https://www.youtube.com/@abc/shorts"), "https://www.youtube.com/@abc/shorts")
        self.assertEqual(k("https://www.youtube.com/playlist?list=PL1"), "https://www.youtube.com/playlist")  # 查詢字串會去掉
        self.assertEqual(k(""), "")

    def test_parse_remote(self):
        doc = fs_doc([{"url": "https://www.youtube.com/@a", "name": "A", "enabled": True},
                      {"url": "https://www.youtube.com/@b", "name": "B", "enabled": False},
                      {"url": "", "name": "空"}, {"url": "https://www.youtube.com/@c"}])
        out = Y.parse_remote_channels(doc)
        self.assertEqual([c["name"] for c in out], ["A", "B", ""])
        self.assertEqual([c["enabled"] for c in out], [True, False, True])
        self.assertEqual(Y.parse_remote_channels({}), [])

    def test_merge_remote_wins(self):
        remote = [{"url": "https://www.youtube.com/@a", "name": "後台A", "enabled": False}]
        local = Y.parse_tsv_channels("# 註解\nhttps://www.youtube.com/@a/videos\t舊A\t1\nhttps://www.youtube.com/@z\tZ\n")
        m = Y.merge_channels(remote, local)
        self.assertEqual(len(m), 2)
        self.assertEqual(m[0], {"url": "https://www.youtube.com/@a/videos", "name": "後台A", "enabled": False})
        self.assertEqual(m[1]["url"], "https://www.youtube.com/@z/videos")

    def test_fetch_and_cache_fallback(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(Y, "ENGINE", Path(d)), mock.patch.object(Y, "log"):
                class R:
                    def __init__(self, b): self.b = b
                    def read(self): return self.b
                    def __enter__(self): return self
                    def __exit__(self, *a): return False
                body = json.dumps(fs_doc([{"url": "https://www.youtube.com/@a", "name": "A", "enabled": True}])).encode()
                with mock.patch.object(Y.urllib.request, "urlopen", return_value=R(body)):
                    items, src = Y.fetch_remote_channels()
                self.assertEqual((len(items), src), (1, "後台"))
                self.assertTrue((Path(d) / "channels.remote.tsv").exists())
                with mock.patch.object(Y.urllib.request, "urlopen", side_effect=OSError("offline")):
                    items, src = Y.fetch_remote_channels()
                self.assertEqual((items[0]["name"], src), ("A", "後台快取"))
                with mock.patch.dict(Y.CFG, {"channels_url": ""}):
                    self.assertEqual(Y.fetch_remote_channels(), ([], "未設定"))


if __name__ == "__main__":
    unittest.main()
