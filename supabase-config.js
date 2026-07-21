/* =====================================================================
   Supabase 連線設定（皆為公開值，可安全放前端）
   Supabase → Project Settings → API：
     Project URL          → SUPABASE_URL
     Project API keys · anon public → SUPABASE_ANON_KEY
   兩者留空時，前台會自動改用 kit.jsx 內建的預設資料，網站照常運作。
   ===================================================================== */
window.SUPABASE_URL = "";
window.SUPABASE_ANON_KEY = "";
