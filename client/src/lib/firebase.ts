import { initializeApp } from "firebase/app";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    Firestore
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Validate config keys (best-effort)
const requiredKeys = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
];

const missingKeys = requiredKeys.filter(
    (key) => !firebaseConfig[key as keyof typeof firebaseConfig]
);

// Helpful debug log during build/dev — won't expose secrets in production logs
console.debug("🔥 Firebase Config Debug:", {
    projectId: firebaseConfig.projectId ?? "(missing)",
    apiKey: firebaseConfig.apiKey ? "Set" : "Missing",
});

// If we're not running in a browser environment (e.g. during server build),
// skip initializing the Firebase client SDK. This prevents build-time errors
// when Vercel (or other hosts) evaluate files server-side where `import.meta.env`
// variables may not be provided.
let app: ReturnType<typeof initializeApp> | null = null;
let db: Firestore | null = null;
let auth: ReturnType<typeof getAuth> | null = null;

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

if (!isBrowser) {
    if (missingKeys.length > 0) {
        console.warn(
            `Firebase client config incomplete during server/build: ${missingKeys.join(", ")}`
        );
    }
    // Export nulls for server-side usage; server functions should use the Admin SDK.
} else {
    if (missingKeys.length > 0) {
        console.error(
            `Missing Firebase configuration keys: ${missingKeys.join(", ")}.\n` +
                "Set the VITE_FIREBASE_* environment variables in your hosting provider or .env file."
        );
    } else {
        app = initializeApp(firebaseConfig);

        try {
            db = initializeFirestore(app, {
                localCache: persistentLocalCache({
                    tabManager: persistentMultipleTabManager(),
                }),
            });
            console.info("Firestore initialized with offline persistence enabled.");
        } catch (error) {
            console.warn(
                "Failed to initialize Firestore with offline persistence, falling back to default getFirestore():",
                error
            );
            db = getFirestore(app);
        }

        try {
            auth = getAuth(app);
        } catch (error) {
            console.warn(
                "Firebase Auth not initialized. This is expected if you haven't enabled Authentication in Firebase Console.",
                error
            );
            auth = null;
        }
    }
}

export { app, db, auth };
