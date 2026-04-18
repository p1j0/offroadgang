/* ============================================================
   config.js – Supabase client & app-wide constants
   ============================================================ */

const SUPABASE_URL  = 'https://kkoeeyqxubtcqvonckss.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrb2VleXF4dWJ0Y3F2b25ja3NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjU4NjAsImV4cCI6MjA5MDIwMTg2MH0.tBW2YV-FeLP9BXIBwjBfybuAd4ZET0uZ3rIOsI2iXT4';

const { createClient } = window.supabase;

/** Global Supabase client – used by api.js and auth.js */
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/**
 * VAPID Public Key für Web Push Notifications.
 * Der zugehörige Private Key liegt als Supabase Secret: VAPID_PRIVATE_KEY
 */
const VAPID_PUBLIC_KEY = 'BFU6H4JSsYeG8nWKdpGBlp8yDfG0bMp7tVgT64nCV2kn8_yXzhn7TuC-HONtffEcRNtDE3r5P1UafTrnyGBaQAY';

/* Cloudinary config */
const CLOUDINARY_CLOUD  = 'dcsuzsyf0';
const CLOUDINARY_PRESET = 'motoroute_uploads';
const CLOUDINARY_URL    = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`;

const ALLOWED_MEDIA_TYPES = ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'];
const MAX_FILE_SIZE       = 10 * 1024 * 1024; // 10 MB
