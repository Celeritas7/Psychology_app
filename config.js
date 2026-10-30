// Public client settings. The publishable key is safe in the browser:
// every psychology_* table is locked by row-level security to the signed-in owner.
window.PSY_CONFIG = {
  supabaseUrl: "https://wylxvmkcrexwfpjpbhyy.supabase.co",
  supabaseKey: "sb_publishable_e3pDOuxIdstaC7s0a680kQ_R10TrAyv",
  // Only this Google account may use the app. Anyone else is signed straight out.
  ownerEmail: "mangaonkaraniket@gmail.com"
};
