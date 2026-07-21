-- =====================================================================
-- 艾倫報報 · Allen I³ Aurora — 後台資料庫 (Supabase / PostgreSQL)
-- ---------------------------------------------------------------------
-- 用途：讓後台 (admin) 能 CRUD 儀表板各區塊資料，前台即時讀取。
-- 隔離：所有資料表以 aurora_ 前綴，不影響同專案內既有資料表。
-- 安全：RLS 開啟；任何人可「讀」，僅指定 email 登入後可「寫」。
--
-- 使用方式：
--   1. 在你選定的 Supabase 專案 → SQL Editor 貼上整份執行一次。
--   2. Supabase → Authentication → Users → Add user 建立一個帳號，
--      email 必須等於下方 OWNER_EMAIL（預設 allenchen1113.official@gmail.com）。
--   3. 把專案 URL 與 anon key 填入 supabase-config.js。
-- 重新執行本檔為冪等（可安全重跑），但會以 on conflict 保留既有 id。
-- =====================================================================

-- 若要更換管理者 email，改這裡（需與 Supabase Auth 帳號一致）
-- OWNER_EMAIL = 'allenchen1113.official@gmail.com'

-- ---------- 資料表 ----------
create table if not exists public.aurora_stats (
  id    uuid primary key default gen_random_uuid(),
  sort  int  not null default 0,
  label text not null,
  value text,
  unit  text,
  delta text,
  tone  text,
  mode  text,
  data  jsonb default '[]'::jsonb,
  link  text,
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_focus (
  id    uuid primary key default gen_random_uuid(),
  sort  int  not null default 0,
  tag   text,
  tone  text,
  title text not null,
  meta  text,
  icon  text,
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_reading (
  id    uuid primary key default gen_random_uuid(),
  sort  int  not null default 0,
  title text not null,
  src   text,
  pct   int  default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_podcasts (
  id    uuid primary key default gen_random_uuid(),
  sort  int  not null default 0,
  title text not null,
  meta  text,
  tone  text,
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_links (
  id    uuid primary key default gen_random_uuid(),
  sort  int  not null default 0,
  label text not null,
  icon  text,
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_issues (
  id    uuid primary key default gen_random_uuid(),
  sort  int  not null default 0,
  no    text,
  kind  text,
  date  text,
  tone  text,
  title text not null,
  items int  default 0,
  cover text,
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_annuli (
  id    uuid primary key default gen_random_uuid(),
  sort  int  not null default 0,
  year  text,
  tone  text,
  title text not null,
  body  text,
  created_at timestamptz not null default now()
);

-- ---------- RLS + 權限（僅針對 aurora_ 資料表，逐表授權，不動其他表） ----------
do $$
declare
  t text;
  owner_email constant text := 'allenchen1113.official@gmail.com';
  tables text[] := array[
    'aurora_stats','aurora_focus','aurora_reading',
    'aurora_podcasts','aurora_links','aurora_issues','aurora_annuli'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);

    -- 公開讀取
    execute format('drop policy if exists %I on public.%I;', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true);', t || '_read', t);

    -- 僅指定 email 可寫
    execute format('drop policy if exists %I on public.%I;', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((auth.jwt() ->> ''email'') = %L) with check ((auth.jwt() ->> ''email'') = %L);',
      t || '_write', t, owner_email, owner_email
    );

    -- 逐表授權（避免用 ALL TABLES 影響其他既有表）
    execute format('grant select on public.%I to anon, authenticated;', t);
    execute format('grant insert, update, delete on public.%I to authenticated;', t);
  end loop;
end $$;

-- ---------- 種子資料（僅在資料表為空時插入，重跑不覆蓋你的編輯） ----------
insert into public.aurora_stats (sort,label,value,unit,delta,tone,mode,data,link)
select * from (values
  (1,'加權指數 TAIEX','23,588','pt','+0.75%','insight','finance','[6.2,6.6,6.3,7,6.8,7.2,7.1,7.5,7.8]'::jsonb,'https://tw.stock.yahoo.com/quote/%5ETWII'),
  (2,'本月結餘','42,180','TWD','+8.0%','intelligence','semantic','[4,4.2,4.1,4.5,4.4,4.8,5,5.2]'::jsonb,null),
  (3,'深度工作','26.5','hr','+12%','illumination','semantic','[3,3.5,3.2,4,3.8,4.4,4.6,5]'::jsonb,null),
  (4,'待讀清單','12','篇','-3','insight','semantic','[8,7,9,6,5,6,5,4]'::jsonb,null)
) as v
where not exists (select 1 from public.aurora_stats);

insert into public.aurora_focus (sort,tag,tone,title,meta,icon)
select * from (values
  (1,'理財','insight','外資投信「雙連買」新增 3 檔','半導體 · 航運 · 今日 09:41','chart'),
  (2,'工作','intelligence','Q3 產品藍圖評審會議前置準備','明日 14:00 · 附 3 份文件','briefcase'),
  (3,'研究','illumination','LLM Agent 記憶架構 — 讀書筆記整理','進度 60% · 待續 2 節','compass'),
  (4,'興趣','insight','薩克斯風 · 週末錄音清單','3 首待練 · 上次 06/28','sparkle')
) as v
where not exists (select 1 from public.aurora_focus);

insert into public.aurora_reading (sort,title,src,pct)
select * from (values
  (1,'原子習慣：微小改變的複利效應','重讀筆記',82),
  (2,'The Almanack of Naval Ravikant','Kindle',45),
  (3,'台股籌碼面實戰：三大法人解讀','PDF',12)
) as v
where not exists (select 1 from public.aurora_reading);

insert into public.aurora_podcasts (sort,title,meta,tone)
select * from (values
  (1,'股癌 Gooaye — EP.整理盤心法','1h 12m · 昨天','insight'),
  (2,'曼報 Manny''s Newsletter Radio','38m · 2 天前','intelligence'),
  (3,'Lex Fridman — Memory & Agents','2h 04m · 本週','illumination')
) as v
where not exists (select 1 from public.aurora_podcasts);

insert into public.aurora_links (sort,label,icon)
select * from (values
  (1,'Showmethemoney 看盤','chart'),
  (2,'TradingView','chart'),
  (3,'Notion 研究庫','book'),
  (4,'GitHub','link'),
  (5,'Medium 草稿','paper'),
  (6,'Google Scholar','compass')
) as v
where not exists (select 1 from public.aurora_links);

insert into public.aurora_issues (sort,no,kind,date,tone,title,items,cover)
select * from (values
  (1,'26','週報','2026.06.29','insight','AI 代理的記憶戰爭，與台股的靜默輪動',8,'../../assets/rabbit-reading.jpeg'),
  (2,'25','週報','2026.06.22','insight','當利率轉彎，現金流的重新定價',7,'../../assets/rabbit-proposal.jpeg'),
  (3,'06','月報','2026.06.01','intelligence','六月總結：三個決定，一次轉身',14,'../../assets/rabbit-mountain.jpeg'),
  (4,'24','週報','2026.06.15','insight','被高估的專注，與被低估的休息',6,'../../assets/rabbit-bike.jpeg'),
  (5,'23','週報','2026.06.08','insight','把研究做成產品：從筆記到電子報',9,'../../assets/rabbit-forest.jpeg'),
  (6,'183','日報','2026.06.30','illumination','週一速報：新的一週，三個先看的訊號',3,'../../assets/rabbit-golden.jpeg')
) as v
where not exists (select 1 from public.aurora_issues);

insert into public.aurora_annuli (sort,year,tone,title,body)
select * from (values
  (1,'1975','insight','序章 · 出生','一切的起點。'),
  (2,'1998','intelligence','投入資訊科技','以 ITS 專業踏入職場，開始累積系統思維。'),
  (3,'2011','illumination','拿起薩克斯風','音樂成為生活的另一種語言與節奏。'),
  (4,'2020','insight','開始寫作與研究','把每天的觀察，變成可累積的筆記與洞察。'),
  (5,'2024','intelligence','Showmethemoney 上線','開源台股看盤儀表板，工具服務更多人。'),
  (6,'2026','illumination','艾倫報報 創刊','洞察世界．累積智慧．點亮未來 — 個人品牌成形。')
) as v
where not exists (select 1 from public.aurora_annuli);
