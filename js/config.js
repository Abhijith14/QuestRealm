/* ═══════════════════════════════════════════════════════════════
   QuestRealm · public Supabase config
   These two values are PUBLIC by design — the anon key is meant to
   ship in client-side JS. Access is governed by Row-Level Security
   policies in the database, NOT by hiding this key. Never put the
   service_role key or the DB password here.
   ═══════════════════════════════════════════════════════════════ */
window.QR_CONFIG = {
  SUPABASE_URL: 'https://uwqdunohqogcbhgqacpl.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cWR1bm9ocW9nY2JoZ3FhY3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NDAzNjYsImV4cCI6MjEwMTQxNjM2Nn0.EzgYfY27lLd1N5vdrQtOf_8d_f3oyzT52Y4zpb6FIa0',
};
