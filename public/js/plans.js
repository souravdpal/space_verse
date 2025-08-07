document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Firebase SDK and initialization
    const waitForFirebase = () => {
        return new Promise((resolve, reject) => {
            const checkFirebase = () => {
                if (window.firebase && window.firebase.auth && window.firebase.apps.length) {
                    console.log('✅ Firebase SDK and app initialized');
                    resolve();
                } else {
                    console.log('⌛ Waiting for Firebase SDK and initialization...');
                    setTimeout(checkFirebase, 100);
                }
            };
            checkFirebase();
        });
    };

    try {
        await waitForFirebase(); // Ensure Firebase SDK and app are initialized
    } catch (error) {
        console.error('Error waiting for Firebase SDK:', error);
        alert('Failed to initialize Firebase. Please try again.');
        return;
    }

    const submitKeyBtn = document.getElementById('submitKeyBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const successMessage = document.getElementById('successMessage');
    const premiumBtn = document.getElementById('premiumBtn');

    // Token header function for API requests
    const waitForAuth = () => {
        return new Promise((resolve, reject) => {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    console.log('✅ Authenticated user:', user.displayName || user.uid);
                    resolve(user);
                } else {
                    console.error('⚠️ No authenticated user');
                    reject(new Error('No authenticated user'));
                }
            });
        });
    };

    try {
        await waitForAuth(); // Ensure user is authenticated
    } catch (error) {
        console.error('Error waiting for auth:', error);
        alert('No authenticated user. Redirecting to login.');
        setTimeout(() => window.location.href = '/login', 1000);
        return;
    }

    document.getElementById('free-b').addEventListener('click', () => {
        window.location.href = '/home';
    });

    async function addNotification(uid, message, category) {
        try {
            const res = await fetch('/notify/add', {
                method: 'POST',
                headers: await firebaseAuth.Tokenheader(),
                body: JSON.stringify({ uid, not: message, category })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to add notification');
            }
            console.log('Add Notification:', data);
        } catch (err) {
            console.error('Error adding notification:', err);
            alert('Failed to add notification: ' + err.message);
        }
    }

    submitKeyBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            const userId = localStorage.getItem('id');
            if (!userId) {
                alert('User ID not found. Please log in.');
                return;
            }
            if (!apiKey.startsWith("gsk_")) {
                apiKeyInput.value = '';
                return alert('Invalid API key!');
            }

            const userData = {
                userId: userId,
                token: apiKey
            };
            console.log('user_api_data', JSON.stringify(userData));
            try {
                const res = await fetch('/gsk/token', {
                    method: 'POST',
                    headers: await firebaseAuth.Tokenheader(),
                    body: JSON.stringify(userData)
                });
                const data = await res.json();
                if (!res.ok) {
                    alert(data.msg || 'Error occurred');
                    apiKeyInput.value = `You cannot bypass token rate limit after adding one token. Please come back next day or buy premium to get more limit and usage.`;
                    return;
                }
                successMessage.classList.remove('hidden');
                apiKeyInput.value = '';
                console.log(data.msg);
                let APImsg = `User, you have added an API ${apiKey.slice(0, 7)}..., now you can have fun and use more features, but it's limited. For more, get premium.`;
                addNotification(userId, APImsg, "API");
                window.location.href = '/home';
            } catch (err) {
                console.error("Fetch error:", err);
                alert('Something went wrong!');
            }
        } else {
            alert('Please enter a valid API key.');
        }
    });

    premiumBtn.addEventListener('click', () => {
        const userId = localStorage.getItem('id');
        if (!userId) {
            alert('User ID not found. Please log in.');
            return;
        }
        let pmsg = "Hey user, buy new plans and use whisper, voice calls, and high-end models to get a whole new experience of the world. Also, get a verified logo and more importance from characters in social media.";
        addNotification(userId, pmsg, "Plans");
        alert('Contact us to get started with the Premium Plan!');
    });
});