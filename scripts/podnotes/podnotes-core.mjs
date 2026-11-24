/* =====================================================================
   常聽 Podcast 重點筆記 · 同步純邏輯（無相依；測試 node --test scripts/podnotes/podnotes.test.mjs）
   - slimIndex(idx)：Drive notes/podcast/index.json → data/podnotes.json（只留前台顯示欄位，絕不含逐字稿）
   - cardFiles(items)：每集要放到網站的圖卡（Drive 相對路徑 → assets/podnotes/<集數ID>_FB|IG.png）
   - parseTranscriptMd(text)：Drive transcripts/<集數ID>.md → Firestore aurora_podcast_transcripts 文件
   ===================================================================== */
export const OUT = "data/podnotes.json";
export const CARD_DIR = "assets/podnotes";
export const MAX_ITEMS = 60;
export const ID_RE = /^[a-z0-9][a-z0-9-]{1,30}-\d{8}$/;
export const TRANSCRIPT_COLL = "aurora_podcast_transcripts";
export const MAX_TRANSCRIPT_CHARS = 250000; // Firestore 單一文件上限 1 MiB；中文約 3 bytes／字

const str = (v, n) => String(v == null ? "" : v).slice(0, n);
const https = (v, n = 300) => (/^https:\/\//.test(String(v || "")) ? str(v, n) : "");
const relOk = (v) => /^\d{8}\/pilotone\/[a-z0-9-]+\/[A-Za-z0-9_.-]+\.png$/.test(String(v || ""));

/* Drive 索引 → 前台資料（新到舊、最多 MAX_ITEMS 筆；只有 id 合法的集數） */
export function slimIndex(idx) {
  const items = (idx && Array.isArray(idx.items) ? idx.items : [])
    .filter((x) => x && ID_RE.test(String(x.id || "")))
    .map((x) => {
      const c = x.cornell || {};
      const pub = str(x.published, 10);
      return {
        id: x.id, code: str(x.code, 32), show: str(x.show || x.author, 60), title: str(x.title, 200),
        url: https(x.url), published: pub, date: pub.replace(/-/g, "."), duration: str(x.duration, 20),
        category: str(x.category, 20), headline: str(x.headline, 120), language: str(x.language, 8),
        summary: (Array.isArray(x.summary) ? x.summary : []).slice(0, 5).map((s) => str(s, 200)),
        cornell: { rows: (Array.isArray(c.rows) ? c.rows : []).slice(0, 6).map((r) => ({ cue: str(r && r.cue, 40), note: str(r && r.note, 240) })),
          summary: str(c.summary, 240) },
        cards: {
          fb: relOk(x.cards && x.cards.fb) ? `${CARD_DIR}/${x.id}_FB.png` : "",
          ig: relOk(x.cards && x.cards.ig) ? `${CARD_DIR}/${x.id}_IG.png` : "",
        },
        added: str(x.added, 8),
      };
    })
    .sort((a, b) => (b.added + b.published + b.id).localeCompare(a.added + a.published + a.id))
    .slice(0, MAX_ITEMS);
  return { updatedAt: idx && idx.updatedAt ? str(idx.updatedAt, 40) : "", items };
}

/* 每集圖卡：Drive 相對路徑（notes/podcast 底下）→ 網站路徑 */
export function cardFiles(rawItems, slimItems) {
  const keep = new Set(slimItems.map((x) => x.id));
  const out = [];
  for (const x of rawItems || []) {
    if (!x || !keep.has(x.id) || !x.cards) continue;
    for (const k of ["fb", "ig"]) {
      if (relOk(x.cards[k])) out.push({ id: x.id, drive: x.cards[k], site: `${CARD_DIR}/${x.id}_${k.toUpperCase()}.png` });
    }
  }
  return out;
}

/* 網站上已不在清單裡的圖卡（要刪除） */
export function staleCards(existingNames, slimItems) {
  const want = new Set(slimItems.flatMap((x) => [x.cards.fb, x.cards.ig]).filter(Boolean).map((p) => p.split("/").pop()));
  return existingNames.filter((n) => /\.png$/.test(n) && !want.has(n));
}

/* transcripts/<集數ID>.md：首行 <!-- podnotes-transcript {json} -->，空一行後為逐字稿 */
export function parseTranscriptMd(text, { id = "", driveModified = "", syncedAt = new Date().toISOString() } = {}) {
  const s = String(text || "");
  const m = s.match(/^<!--\s*podnotes-transcript\s+(\{[\s\S]*?\})\s*-->\s*\n?/);
  let head = {};
  if (m) { try { head = JSON.parse(m[1]); } catch { head = {}; } }
  const body = (m ? s.slice(m[0].length) : s).trim();
  const eid = ID_RE.test(String(head.id || "")) ? head.id : id;
  if (!ID_RE.test(eid) || !body) return null;
  return {
    id: eid, show: str(head.show, 60), title: str(head.title, 200), published: str(head.published, 10),
    durationSec: Math.max(0, Math.round(Number(head.duration_sec) || 0)), language: str(head.language, 8),
    transcriber: str(head.transcriber, 160), url: https(head.url),
    transcript: body.slice(0, MAX_TRANSCRIPT_CHARS), chars: body.length, truncated: body.length > MAX_TRANSCRIPT_CHARS,
    driveModified: str(driveModified, 40), syncedAt,
  };
}
