
const SUPABASE_URL = "https://nsyvcxyfyvkghqsnrctc.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GeYOgnjDvdK4NgI-3j0htA_Ac3TZwQa";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

window.supabaseClient = supabaseClient;
