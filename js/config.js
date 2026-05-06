/* ============================================================
   config.js – Supabase client & app-wide constants
   ============================================================ */

const SUPABASE_URL  = 'https://kkoeeyqxubtcqvonckss.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrb2VleXF4dWJ0Y3F2b25ja3NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjU4NjAsImV4cCI6MjA5MDIwMTg2MH0.tBW2YV-FeLP9BXIBwjBfybuAd4ZET0uZ3rIOsI2iXT4';

function createOfflineSupabaseClient() {
  const offlineResult = () => Promise.resolve({
    data: null,
    error: new Error('Supabase client unavailable while offline'),
    count: null,
  });

  const query = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve) => offlineResult().then(resolve);
      if (prop === 'catch') return (reject) => offlineResult().catch(reject);
      if (prop === 'finally') return (cb) => offlineResult().finally(cb);
      return () => query;
    },
  });

  const channel = {
    on() { return channel; },
    subscribe() { return channel; },
    unsubscribe() { return Promise.resolve(); },
  };

  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({ error: null }),
      signUp: () => offlineResult(),
      signInWithPassword: () => offlineResult(),
      updateUser: () => offlineResult(),
    },
    from: () => query,
    functions: {
      invoke: () => offlineResult(),
    },
    channel: () => channel,
    removeChannel: () => Promise.resolve(),
  };
}

const createClient = window.supabase?.createClient;

/** Global Supabase client – used by api.js and auth.js */
const sb = createClient
  ? createClient(SUPABASE_URL, SUPABASE_ANON)
  : createOfflineSupabaseClient();

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

// Injected by build.sh on every Netlify deploy
const APP_VERSION = 'dev';
const BUILD_DATE  = 'lokal';
