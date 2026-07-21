/* =====================================================================
   Firebase Web 設定（皆為公開值，可安全放前端）
   Firebase Console → 專案設定 ⚙️ → 一般 → 你的應用程式 → SDK 設定與配置
   → 選「Config」，把整包貼進下方對應欄位。
   欄位留空時，前台會自動改用 kit.jsx 內建的預設資料，網站照常運作。
   ===================================================================== */
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",        // e.g. your-project.firebaseapp.com
  projectId: "",         // e.g. your-project
  storageBucket: "",     // e.g. your-project.appspot.com
  messagingSenderId: "",
  appId: "",
};
