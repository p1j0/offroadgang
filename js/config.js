/* ============================================================
   config.js – Supabase client & app-wide constants
   ============================================================ */

const SUPABASE_URL  = 'https://kkoeeyqxubtcqvonckss.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrb2VleXF4dWJ0Y3F2b25ja3NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjU4NjAsImV4cCI6MjA5MDIwMTg2MH0.tBW2YV-FeLP9BXIBwjBfybuAd4ZET0uZ3rIOsI2iXT4';

const { createClient } = window.supabase;

/** Global Supabase client – used by api.js and auth.js */
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
