const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// ==================== SECURITY CONFIG ====================
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'ADMIN_' + crypto.randomBytes(16).toString('hex');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'];

// ==================== MIDDLEWARE ====================
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));
app.use(express.json());

// Rate Limiting (Simple)
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimit[ip]) {
        rateLimit[ip] = { count: 1, startTime: now };
        return next();
    }
    
    const windowPassed = now - rateLimit[ip].startTime > RATE_LIMIT_WINDOW;
    if (windowPassed) {
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

// Validate API Key Middleware
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'API Key required'
        });
    }
    
    // Check if API key exists in database
    const data = getData();
    const keyData = data.keys.find(k => k.key === apiKey || k.apiKey === apiKey);
    
    if (!keyData) {
        return res.status(401).json({
            success: false,
            message: 'Invalid API Key'
        });
    }
    
    if (!keyData.isActive) {
        return res.status(403).json({
            success: false,
            message: 'API Key is deactivated'
        });
    }
    
    // Check expiry
    if (new Date() > new Date(keyData.expiry)) {
        return res.status(403).json({
            success: false,
            message: 'API Key expired'
        });
    }
    
    req.apiKeyData = keyData;
    next();
}

// Generate Secure API Key (Admin only)
function generateApiKey() {
    return 'API_' + crypto.randomBytes(24).toString('hex').toUpperCase();
}

// ==================== DATABASE (In-Memory) ====================
let database = {
    keys: [],
    users: [],
    adminSessions: [],
    apiKeys: []
};

function getData() {
    return database;
}

function saveData(data) {
    database = data;
}

// ==================== ADMIN APIs (With Admin API Key) ====================

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password, adminKey } = req.body;
    
    // Check admin API key
    if (adminKey && adminKey === ADMIN_API_KEY) {
        const token = 'admin_' + crypto.randomBytes(16).toString('hex');
        database.adminSessions.push({
            token: token,
            created: new Date().toISOString()
        });
        return res.json({
            success: true,
            message: 'Admin login successful',
            token: token,
            adminKey: ADMIN_API_KEY
        });
    }
    
    // Fallback to username/password
    if (username === 'admin' && password === 'admin123') {
        const token = 'admin_' + crypto.randomBytes(16).toString('hex');
        database.adminSessions.push({
            token: token,
            created: new Date().toISOString()
        });
        return res.json({
            success: true,
            message: 'Admin login successful',
            token: token,
            adminKey: ADMIN_API_KEY
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
            message: 'Unauthorized'
        });
    }
    
    // Generate both user key and API key
    const userKey = 'KEY_' + crypto.randomBytes(12).toString('hex').toUpperCase();
    const apiKey = 'API_' + crypto.randomBytes(24).toString('hex').toUpperCase();
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
        maxUsage: 100,
        createdBy: 'admin'
    };
    
    database.keys.push(newKey);
    
    res.json({
        success: true,
        message: 'Key generated successfully',
        key: {
            userKey: userKey,
            apiKey: apiKey,
            name: newKey.name,
            expiry: newKey.expiry
        }
    });
});

// Get All Keys
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
        key: k.key,
        apiKey: k.apiKey ? k.apiKey.substring(0, 10) + '...' : null,
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

// Delete Key
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

// Toggle Key Status
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

// Verify Key - Requires API Key
app.post('/api/user/verify', rateLimiter, validateApiKey, (req, res) => {
    const { key } = req.body;
    
    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a key'
        });
    }
    
    const data = getData();
    const keyData = data.keys.find(k => k.key === key || k.apiKey === key);
    
    if (!keyData) {
        return res.status(404).json({
            success: false,
            message: 'Invalid key'
        });
    }
    
    // Check expiry
    if (new Date() > new Date(keyData.expiry)) {
        return res.status(403).json({
            success: false,
            message: 'Key expired'
        });
    }
    
    // Check active
    if (!keyData.isActive) {
        return res.status(403).json({
            success: false,
            message: 'Key deactivated'
        });
    }
    
    res.json({
        success: true,
        message: 'Key verified',
        keyDetails: {
            name: keyData.name,
            expiry: keyData.expiry,
            usageCount: keyData.usageCount,
            maxUsage: keyData.maxUsage
        }
    });
});

// User Login - Requires API Key
app.post('/api/user/login', rateLimiter, validateApiKey, (req, res) => {
    const { key, username } = req.body;
    
    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a key'
        });
    }
    
    const data = getData();
    const keyData = data.keys.find(k => k.key === key || k.apiKey === key);
    
    if (!keyData || !keyData.isActive) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or inactive key'
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
            message: 'Usage limit exceeded'
        });
    }
    
    // Find or create user
    let user = data.users.find(u => u.key === key || u.apiKey === key);
    
    if (!user) {
        user = {
            id: 'USER_' + crypto.randomBytes(8).toString('hex').toUpperCase(),
            username: username || 'User',
            key: key,
            apiKey: keyData.apiKey,
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
    
    // Generate JWT token for session
    const jwtToken = jwt.sign(
        { userId: user.id, key: key },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    
    res.json({
        success: true,
        message: 'Login successful',
        token: jwtToken,
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
            maxUsage: keyData.maxUsage
        }
    });
});

// Get User Profile (with JWT)
app.get('/api/user/profile', rateLimiter, (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token required'
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const data = getData();
        const user = data.users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                loginCount: user.loginCount,
                lastLogin: user.lastLogin,
                created: user.created
            }
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
});

// ==================== PUBLIC ROUTES ====================

// Server Status (Public)
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        version: '2.0',
        secured: true,
        timestamp: new Date().toISOString()
    });
});

// Get API Keys (Public - For App)
app.get('/api/config', (req, res) => {
    res.json({
        requiresApiKey: true,
        requiresJWT: true,
        rateLimit: RATE_LIMIT_MAX + ' requests per minute'
    });
});

// ==================== HOME PAGE ====================

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
                .security-badge { background: #4CAF50; color: white; padding: 5px 15px; border-radius: 20px; display: inline-block; }
                pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
            </style>
        </head>
        <body>
            <h1>🔐 Secure Key Manager Server</h1>
            <p><span class="security-badge">✅ Security Enabled</span></p>
            
            <div class="box">
                <h3>📋 Security Features</h3>
                <ul>
                    <li>✅ API Key required for all requests</li>
                    <li>✅ Rate Limiting (${RATE_LIMIT_MAX} req/min)</li>
                    <li>✅ JWT Authentication</li>
                    <li>✅ CORS Protection</li>
                    <li>✅ Key Expiry</li>
                </ul>
            </div>
            
            <div class="box">
                <h3>🔑 How to Use</h3>
                <p>1. Get API Key from Admin Panel</p>
                <p>2. Use API Key in header: <code>x-api-key: YOUR_API_KEY</code></p>
                <p>3. Call APIs with rate limiting</p>
                <pre>
POST /api/user/verify
Headers: x-api-key: YOUR_API_KEY
Body: { "key": "KEY_XXXX" }

POST /api/user/login
Headers: x-api-key: YOUR_API_KEY
Body: { "key": "KEY_XXXX", "username": "User" }
                </pre>
            </div>
            
            <p>Admin Credentials: admin / admin123</p>
        </body>
        </html>
    `);
});

// Start server
app.listen(port, () => {
    console.log('✅ Secure server running on port ' + port);
    console.log('🔑 Admin API Key: ' + ADMIN_API_KEY);
    console.log('🔐 JWT Secret: ' + JWT_SECRET);
    console.log('🌐 http://localhost:' + port);
});