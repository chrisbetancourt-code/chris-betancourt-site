// Public settings. The "publishable" key is designed to be visible in the browser:
// what a visitor can actually do is decided by the database rules, not by this key.
// NEVER put the service-role / secret key in this file.
export const SUPABASE_URL = 'https://ltjegtsprbvbkmxczftg.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_--jiJvESX7bEZoqT_JfMLg_ZtYdAqTh';

// Upload limit for student videos. Supabase's free plan allows 50 MB per file.
// If you move to a paid plan and raise the limit, change it in three places:
// here, the storage bucket, and the size check on public.submissions (see supabase/SETUP.md).
export const MAX_VIDEO_MB = 50;
