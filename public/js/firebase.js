(function () {
    // Wait for Firebase SDK to load
    function waitForFirebaseSDK() {
        return new Promise((resolve, reject) => {
            const checkSDK = () => {
                if (typeof firebase !== 'undefined') {
                    console.log('✅ Firebase SDK detected');
                    resolve();
                } else {
                    console.log('⌛ Waiting for Firebase SDK...');
                    setTimeout(checkSDK, 100);
                }
            };
            checkSDK();
        });
    }

    // Initialize Firebase after SDK is loaded
    async function initializeFirebase() {
        try {
            await waitForFirebaseSDK();

            // Firebase configuration
            // For Firebase JS SDK v7.20.0 and later, measurementId is optional
            // For Firebase JS SDK v7.20.0 and later, measurementId is optional
            const firebaseConfig = {
                apiKey: "AIzaSyA3_Otys41HjaAnDG8f2jFuzzuUJTiF-Po",
                authDomain: "store-work-10c7d.firebaseapp.com",
                databaseURL: "https://store-work-10c7d-default-rtdb.firebaseio.com",
                projectId: "store-work-10c7d",
                storageBucket: "store-work-10c7d.firebasestorage.app",
                messagingSenderId: "364380068504",
                appId: "1:364380068504:web:fe303c05a95bb777b6ceed",
                measurementId: "G-DSG9XHW38R"
            };

            // Initialize Firebase
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
                console.log("✅ Firebase initialized successfully");
            } else {
                console.warn("⚠️ Firebase already initialized");
            }
        } catch (error) {
            console.error("🔴 Firebase initialization failed:", error.message);
            throw error;
        }
    }

    // Universal header generator
    async function Tokenheader() {
        console.log('🔍 Generating token header');
        const user = firebase.auth().currentUser;
        if (!user) {
            console.error('No authenticated user in Tokenheader');
            throw new Error('No authenticated user');
        }
        const token = await user.getIdToken(true);
        return {
            'Authorization': `Bearer ${token}`,
            'X-User-ID': user.uid,
            'Content-Type': 'application/json'
        };
    }

    // Fetch wrapper with token
    async function sendWithFreshToken(url, options = {}) {
        console.log('🔍 Sending request with fresh token to:', url);
        const user = firebase.auth().currentUser;
        if (!user) {
            console.error('No authenticated user in sendWithFreshToken');
            throw new Error('No authenticated user');
        }

        let token = await user.getIdToken(true);
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'X-User-ID': user.uid
        };

        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        let response;
        try {
            response = await fetch(url, { ...options, headers });
        } catch (err) {
            console.error(`Network error calling ${url}:`, err);
            throw err;
        }

        // Handle non-JSON responses safely
        const contentType = response.headers.get("content-type") || "";
        let data;
        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.warn(`Non-JSON response from ${url}:`, text.slice(0, 200));
            throw new Error(`Unexpected response format from ${url}`);
        }

        // Retry if token invalid
        if (response.status === 401 && data.error?.toLowerCase().includes("token")) {
            console.warn("Token invalid/expired, refreshing...");
            token = await user.getIdToken(true);
            localStorage.setItem('authToken', token);

            headers['Authorization'] = `Bearer ${token}`;
            const retryResponse = await fetch(url, { ...options, headers });
            const retryData = await retryResponse.json();
            if (!retryResponse.ok) throw new Error(retryData.error || 'Request failed after retry');
            return retryData;
        }

        if (!response.ok) {
            console.error('Request failed:', data.error || 'Unknown error');
            throw new Error(data.error || 'Request failed');
        }

        return data;
    }

    // Token refresh every 55 minutes
    setInterval(async () => {
        const user = firebase.auth().currentUser;
        if (user) {
            try {
                const newToken = await user.getIdToken(true);
                localStorage.setItem('authToken', newToken);
                localStorage.setItem('id', user.uid);
                console.log('🔁 Token refreshed at', new Date().toISOString());
            } catch (err) {
                console.error('🔴 Token refresh failed:', err);
            }
        }
    }, 55 * 60 * 1000);

    // Firebase auth state check
    initializeFirebase().then(() => {
        firebase.auth().onAuthStateChanged(async (user) => {
            const path = window.location.pathname;
            if (user) {
                try {
                    const token = await user.getIdToken();
                    localStorage.setItem('authToken', token);
                    localStorage.setItem('id', user.uid);
                    localStorage.setItem('user', user.displayName || 'Unknown');
                    console.log('✅ Logged in:', user.displayName || user.email);

                    if (path === '/login') {
                        window.location.href = `/view/u/${encodeURIComponent(user.uid)}`;
                    }
                } catch (err) {
                    console.error('Token fetch error:', err);
                    logout();
                }
            } else {
                console.warn('⚠️ No user found. Redirecting...');
                logout(true);
            }
        });
    }).catch(error => {
        console.error('Failed to initialize Firebase:', error);
    });

    // Toast utility
    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.className = `toast ${type}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Global logout
    function logout(force = false) {
        if (!force && !confirm("Are you sure you want to logout?")) return;
        firebase.auth().signOut().then(() => {
            console.log("👋 Logged out successfully");
            localStorage.clear();
            sessionStorage.clear();
            showToast("Logged out", "success");
            setTimeout(() => window.location.href = "/login", 1000);
        }).catch((err) => {
            console.error("Logout failed:", err);
            showToast("Logout failed", "error");
        });
    }

    // Expose functions globally
    window.firebaseAuth = {
        Tokenheader,
        sendWithFreshToken,
        logout
    };

    console.log("🚀 firebase.js loaded");
})();