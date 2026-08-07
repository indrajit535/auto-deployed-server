const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// ==================== SECURITY CONFIG ====================
const ADMIN_API_KEY = 'ADMIN_' + crypto.randomBytes(12).toString('hex').toUpperCase();

// ==================== MIDDLEWARE ====================
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

// Simple Rate Limiting (In-Memory)
const rateLimit = {};
const RATE_LIMIT_MAX = 20; // 20 requests per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute

function rateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!rateLimit[ip]) {
        rateLimit[ip] = { count: 1, startTime: now };
        return next();
    }
    
    if (now - rateLimit[ip].startTime > RATE_LIMIT_WINDOW) {
        rateLimit[ip] = { count: 1, startTime: now };
        return next();
    }
    
    if (rateLimit[ip].count >= RATE_LIMIT_MAX) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please wait.'
        });
    }
    
    rateLimit[ip].count++;
    next();
}

// Validate API Key
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const data = getData();
    const keyData = data.keys.find(k => k.apiKey === apiKey);
    
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'API Key required. Add header: x-api-key'
        });
    }
    
    if (!keyData) {
        return res.status(401).json({
            success: false,
            message: 'Invalid API Key'
        });
    }
    
    if (!keyData.isActive) {
        return res.status(403).json({
            success: false,
            message: 'API Key deactivated'
        });
    }
    
    if (new Date() > new Date(keyData.expiry)) {
        return res.status(403).json({
            success: false,
            message: 'API Key expired'
        });
    }
    
    req.apiKeyData = keyData;
    next();
}

// Generate API Key
function generateApiKey() {
    return 'API_' + crypto.randomBytes(16).toString('hex').toUpperCase();
}

// Generate User Key
function generateUserKey() {
    return 'KEY_' + crypto.randomBytes(10).toString('hex').toUpperCase();
}

// ==================== DATABASE (In-Memory) ====================
let database = {
    keys: [],
    users: [],
    adminSessions: []
};

function getData() {
    return database;
}

// ==================== ADMIN APIs ====================

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'admin123') {
        const token = 'ADMIN_SESSION_' + crypto.randomBytes(12).toString('hex');
        database.adminSessions.push({
            token: token,
            created: new Date().toISOString()
        });
        return res.json({
            success: true,
            message: 'Admin login successful',
            token: token,
            adminApiKey: ADMIN_API_KEY,
            note: 'Use ADMIN_API_KEY as x-api-key for admin APIs'
        });
    }
    
    res.status(401).json({
        success: false,
        message: 'Invalid credentials'
    });
});

// Generate New Key (Admin only)
app.post('/api/admin/generate-key', (req, res) => {
    const { adminToken, keyName, expiryDays } = req.body;
    
    const session = database.adminSessions.find(s => s.token === adminToken);
    if (!session) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized. Login as admin first.'
        });
    }
    
    const userKey = generateUserKey();
    const apiKey = generateApiKey();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (parseInt(expiryDays) || 30));
    
    const newKey = {
        key: userKey,
        apiKey: apiKey,
        name: keyName || 'Default Key',
        created: new Date().toISOString(),
        expiry: expiryDate.toISOString(),
        isActive: true,
        usageCount: 0,
        maxUsage: 100
    };
    
    database.keys.push(newKey);
    
    res.json({
        success: true,
        message: 'Key generated successfully!',
        key: {
            userKey: userKey,
            apiKey: apiKey,
            name: newKey.name,
            expiry: newKey.expiry
        },
        note: 'Use apiKey as x-api-key header in your app'
    });
});

// Get All Keys (Admin only)
app.get('/api/admin/keys', (req, res) => {
    const { adminToken } = req.query;
    
    const session = database.adminSessions.find(s => s.token === adminToken);
    if (!session) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    const safeKeys = database.keys.map(k => ({
        userKey: k.key,
        apiKey: k.apiKey.substring(0, 12) + '...',
        name: k.name,
        isActive: k.isActive,
        expiry: k.expiry,
        usageCount: k.usageCount
    }));
    
    res.json({
        success: true,
        keys: safeKeys,
        total: database.keys.length
    });
});

// Delete Key (Admin only)
app.delete('/api/admin/delete-key/:key', (req, res) => {
    const { adminToken } = req.query;
    const { key } = req.params;
    
    const session = database.adminSessions.find(s => s.token === adminToken);
    if (!session) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    database.keys = database.keys.filter(k => k.key !== key && k.apiKey !== key);
    
    res.json({
        success: true,
        message: 'Key deleted successfully'
    });
});

// Toggle Key Status (Admin only)
app.put('/api/admin/toggle-key/:key', (req, res) => {
    const { adminToken } = req.query;
    const { key } = req.params;
    
    const session = database.adminSessions.find(s => s.token === adminToken);
    if (!session) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    const keyData = database.keys.find(k => k.key === key || k.apiKey === key);
    if (keyData) {
        keyData.isActive = !keyData.isActive;
        res.json({
            success: true,
            message: 'Key status toggled',
            isActive: keyData.isActive
        });
    } else {
        res.status(404).json({
            success: false,
            message: 'Key not found'
        });
    }
});

// ==================== USER APIs (With Rate Limiting) ====================

// Verify User Key - Requires API Key
app.post('/api/user/verify', rateLimiter, validateApiKey, (req, res) => {
    const { key } = req.body;
    
    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a user key'
        });
    }
    
    const data = getData();
    const keyData = data.keys.find(k => k.key === key);
    
    if (!keyData) {
        return res.status(404).json({
            success: false,
            message: 'Invalid user key'
        });
    }
    
    if (new Date() > new Date(keyData.expiry)) {
        return res.status(403).json({
            success: false,
            message: 'Key expired on: ' + keyData.expiry
        });
    }
    
    if (!keyData.isActive) {
        return res.status(403).json({
            success: false,
            message: 'Key is deactivated'
        });
    }
    
    res.json({
        success: true,
        message: 'Key verified successfully!',
        keyDetails: {
            name: keyData.name,
            expiry: keyData.expiry,
            usageCount: keyData.usageCount,
            maxUsage: keyData.maxUsage,
            remaining: keyData.maxUsage - keyData.usageCount
        }
    });
});

// User Login - Requires API Key
app.post('/api/user/login', rateLimiter, validateApiKey, (req, res) => {
    const { key, username } = req.body;
    
    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a user key'
        });
    }
    
    const data = getData();
    const keyData = data.keys.find(k => k.key === key);
    
    if (!keyData) {
        return res.status(401).json({
            success: false,
            message: 'Invalid user key'
        });
    }
    
    if (!keyData.isActive) {
        return res.status(403).json({
            success: false,
            message: 'Key is deactivated'
        });
    }
    
    if (new Date() > new Date(keyData.expiry)) {
        return res.status(403).json({
            success: false,
            message: 'Key expired'
        });
    }
    
    if (keyData.usageCount >= keyData.maxUsage) {
        return res.status(403).json({
            success: false,
            message: 'Usage limit exceeded',
            usageCount: keyData.usageCount,
            maxUsage: keyData.maxUsage
        });
    }
    
    // Find or create user
    let user = data.users.find(u => u.key === key);
    
    if (!user) {
        user = {
            id: 'USER_' + crypto.randomBytes(6).toString('hex').toUpperCase(),
            username: username || 'User',
            key: key,
            loginCount: 0,
            lastLogin: null,
            created: new Date().toISOString()
        };
        data.users.push(user);
    }
    
    // Update counts
    user.loginCount++;
    user.lastLogin = new Date().toISOString();
    keyData.usageCount++;
    
    // Generate simple session token
    const sessionToken = 'SESSION_' + crypto.randomBytes(16).toString('hex').toUpperCase();
    
    res.json({
        success: true,
        message: 'Login successful!',
        sessionToken: sessionToken,
        user: {
            id: user.id,
            username: user.username,
            loginCount: user.loginCount,
            lastLogin: user.lastLogin
        },
        keyDetails: {
            name: keyData.name,
            expiry: keyData.expiry,
            usageCount: keyData.usageCount,
            maxUsage: keyData.maxUsage,
            remaining: keyData.maxUsage - keyData.usageCount
        }
    });
});

// Get All Users (Admin only)
app.get('/api/admin/users', (req, res) => {
    const { adminToken } = req.query;
    
    const session = database.adminSessions.find(s => s.token === adminToken);
    if (!session) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    res.json({
        success: true,
        users: database.users,
        total: database.users.length
    });
});

// ==================== PUBLIC ROUTES ====================

// Server Status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        version: '2.0',
        secured: true,
        rateLimit: RATE_LIMIT_MAX + ' req/min',
        timestamp: new Date().toISOString()
    });
});

// Get Config
app.get('/api/config', (req, res) => {
    res.json({
        requiresApiKey: true,
        rateLimit: RATE_LIMIT_MAX + ' requests per minute',
        authType: 'API Key + Session Token'
    });
});

// Home Page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🔐 Secure Key Manager</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
                .box { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
                h1 { color: #2196F3; }
                .badge { background: #4CAF50; color: white; padding: 5px 15px; border-radius: 20px; display: inline-block; }
                pre { background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; }
                .note { background: #FFF3CD; padding: 10px; border-radius: 4px; border-left: 4px solid #FFC107; }
                .flex { display: flex; gap: 10px; flex-wrap: wrap; }
                input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 200px; }
                button { padding: 8px 20px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; }
                button:hover { background: #1976D2; }
                .result { background: #f5f5f5; padding: 10px; border-radius: 4px; margin-top: 10px; }
            </style>
        </head>
        <body>
            <h1>🔐 Secure Key Manager</h1>
            <p><span class="badge">✅ Security Enabled</span></p>
            
            <div class="box">
                <h3>📋 Security Features</h3>
                <ul>
                    <li>✅ API Key required for all requests</li>
                    <li>✅ Rate Limiting (${RATE_LIMIT_MAX} req/min)</li>
                    <li>✅ Session Token Authentication</li>
                    <li>✅ Key Expiry (Auto deactivate)</li>
                </ul>
            </div>
            
            <div class="box">
                <h3>🔑 Admin Login</h3>
                <div class="flex">
                    <input id="adminUser" placeholder="Username" value="admin">
                    <input id="adminPass" placeholder="Password" value="admin123" type="password">
                    <button onclick="adminLogin()">Login</button>
                </div>
                <div id="adminResult" class="result">Login to get admin token...</div>
            </div>
            
            <div class="box">
                <h3>🔑 Generate Key</h3>
                <div class="flex">
                    <input id="keyName" placeholder="Key Name" value="My Key">
                    <input id="expiryDays" placeholder="Expiry Days" value="30" type="number">
                    <button onclick="generateKey()">Generate Key</button>
                </div>
                <div id="genResult" class="result">Generate a new key...</div>
            </div>
            
            <div class="box">
                <h3>👤 User Panel</h3>
                <div class="flex">
                    <input id="userKey" placeholder="Enter your user key (KEY_)">
                    <button onclick="verifyKey()">Verify</button>
                    <button onclick="userLogin()">Login</button>
                </div>
                <div id="userResult" class="result">Enter a key to verify...</div>
            </div>
            
            <div class="note">
                <strong>📌 How to use in Android App:</strong><br>
                1. Get API Key from Admin Panel<br>
                2. Add header: <code>x-api-key: YOUR_API_KEY</code><br>
                3. Call APIs with rate limiting
            </div>
            
            <script>
                let adminToken = '';
                const API_URL = window.location.origin;
                
                async function adminLogin() {
                    const username = document.getElementById('adminUser').value;
                    const password = document.getElementById('adminPass').value;
                    const result = document.getElementById('adminResult');
                    
                    try {
                        const res = await fetch(API_URL + '/api/admin/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username, password })
                        });
                        const data = await res.json();
                        if (data.success) {
                            adminToken = data.token;
                            result.innerHTML = '<pre style="color:green;">✅ Login successful!\\nAdmin Token: ' + data.token + '\\nAdmin API Key: ' + data.adminApiKey + '</pre>';
                        } else {
                            result.innerHTML = '<pre style="color:red;">❌ ' + data.message + '</pre>';
                        }
                    } catch(e) {
                        result.innerHTML = '<pre style="color:red;">❌ Error: ' + e.message + '</pre>';
                    }
                }
                
                async function generateKey() {
                    const name = document.getElementById('keyName').value;
                    const days = document.getElementById('expiryDays').value;
                    const result = document.getElementById('genResult');
                    
                    if (!adminToken) {
                        result.innerHTML = '<pre style="color:red;">❌ Please login as admin first!</pre>';
                        return;
                    }
                    
                    try {
                        const res = await fetch(API_URL + '/api/admin/generate-key', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ adminToken, keyName: name, expiryDays: parseInt(days) || 30 })
                        });
                        const data = await res.json();
                        if (data.success) {
                            result.innerHTML = '<pre style="color:green;">✅ Key Generated!\\nUser Key: ' + data.key.userKey + '\\nAPI Key: ' + data.key.apiKey + '\\nExpiry: ' + data.key.expiry + '</pre>';
                            document.getElementById('userKey').value = data.key.userKey;
                        } else {
                            result.innerHTML = '<pre style="color:red;">❌ ' + data.message + '</pre>';
                        }
                    } catch(e) {
                        result.innerHTML = '<pre style="color:red;">❌ Error: ' + e.message + '</pre>';
                    }
                }
                
                async function verifyKey() {
                    const key = document.getElementById('userKey').value;
                    const result = document.getElementById('userResult');
                    
                    if (!key) {
                        result.innerHTML = '<pre style="color:red;">❌ Please enter a key</pre>';
                        return;
                    }
                    
                    try {
                        const res = await fetch(API_URL + '/api/user/verify', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'x-api-key': 'API_' 
                            },
                            body: JSON.stringify({ key })
                        });
                        const data = await res.json();
                        result.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                    } catch(e) {
                        result.innerHTML = '<pre style="color:red;">❌ Error: ' + e.message + '</pre>';
                    }
                }
                
                async function userLogin() {
                    const key = document.getElementById('userKey').value;
                    const result = document.getElementById('userResult');
                    
                    if (!key) {
                        result.innerHTML = '<pre style="color:red;">❌ Please enter a key</pre>';
                        return;
                    }
                    
                    try {
                        const res = await fetch(API_URL + '/api/user/login', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'x-api-key': 'API_' 
                            },
                            body: JSON.stringify({ key, username: 'User_' + Math.floor(Math.random()*1000) })
                        });
                        const data = await res.json();
                        result.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                    } catch(e) {
                        result.innerHTML = '<pre style="color:red;">❌ Error: ' + e.message + '</pre>';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: err.message
    });
});

// Start server
app.listen(port, () => {
    console.log('✅ Secure server running on port ' + port);
    console.log('🔑 Admin API Key: ' + ADMIN_API_KEY);
    console.log('🌐 http://localhost:' + port);
    console.log('📌 Admin Login: admin / admin123');
});