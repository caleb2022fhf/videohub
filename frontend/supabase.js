
const SUPABASE_URL = "https://nsyvcxyfyvkghqsnrctc.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_GeYOgnjDvdK4NgI-3j0htA_Ac3TZwQa";

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
