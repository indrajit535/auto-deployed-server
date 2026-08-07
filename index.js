const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ==================== IN-MEMORY DATABASE ====================
// Data store in memory (resets on server restart)
let database = {
    keys: [],
    users: [],
    adminSessions: []
};

// ==================== ADMIN PANEL APIs ====================

// 1. Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    // Default admin credentials
    if (username === 'admin' && password === 'admin123') {
        const token = 'admin_' + crypto.randomBytes(16).toString('hex');
        
        // Save session
        database.adminSessions.push({
            token: token,
            created: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Admin login successful',
            token: token
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }
});

// 2. Generate New Key
app.post('/api/admin/generate-key', (req, res) => {
    const { adminToken, keyName, expiryDays } = req.body;
    
    // Verify admin token
    const session = database.adminSessions.find(s => s.token === adminToken);
    if (!session) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized - Invalid admin token'
        });
    }
    
    // Generate unique key
    const key = 'KEY_' + crypto.randomBytes(12).toString('hex').toUpperCase();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (parseInt(expiryDays) || 30));
    
    const newKey = {
        key: key,
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
        key: newKey
    });
});

// 3. Get All Keys
app.get('/api/admin/keys', (req, res) => {
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
        keys: database.keys,
        total: database.keys.length
    });
});

// 4. Delete Key
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
    
    database.keys = database.keys.filter(k => k.key !== key);
    
    res.json({
        success: true,
        message: 'Key deleted successfully'
    });
});

// 5. Toggle Key Status
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
    
    const keyData = database.keys.find(k => k.key === key);
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

// 6. Get All Users
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

// ==================== USER PANEL APIs ====================

// 1. Verify Key
app.post('/api/user/verify', (req, res) => {
    const { key } = req.body;
    
    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a key'
        });
    }
    
    const keyData = database.keys.find(k => k.key === key);
    
    if (!keyData) {
        return res.status(404).json({
            success: false,
            message: 'Invalid key - Key not found'
        });
    }
    
    // Check expiry
    const expiryDate = new Date(keyData.expiry);
    if (new Date() > expiryDate) {
        return res.status(403).json({
            success: false,
            message: 'Key has expired',
            expiry: keyData.expiry
        });
    }
    
    // Check if active
    if (!keyData.isActive) {
        return res.status(403).json({
            success: false,
            message: 'Key is deactivated'
        });
    }
    
    // Check max usage
    if (keyData.usageCount >= keyData.maxUsage) {
        return res.status(403).json({
            success: false,
            message: 'Key usage limit exceeded',
            usageCount: keyData.usageCount,
            maxUsage: keyData.maxUsage
        });
    }
    
    res.json({
        success: true,
        message: 'Key verified successfully',
        keyDetails: {
            name: keyData.name,
            created: keyData.created,
            expiry: keyData.expiry,
            usageCount: keyData.usageCount,
            maxUsage: keyData.maxUsage,
            isActive: keyData.isActive
        }
    });
});

// 2. User Login with Key
app.post('/api/user/login', (req, res) => {
    const { key, username } = req.body;
    
    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a key'
        });
    }
    
    const keyData = database.keys.find(k => k.key === key);
    
    if (!keyData || !keyData.isActive) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or inactive key'
        });
    }
    
    // Check expiry
    const expiryDate = new Date(keyData.expiry);
    if (new Date() > expiryDate) {
        return res.status(403).json({
            success: false,
            message: 'Key has expired'
        });
    }
    
    // Check max usage
    if (keyData.usageCount >= keyData.maxUsage) {
        return res.status(403).json({
            success: false,
            message: 'Key usage limit exceeded'
        });
    }
    
    // Find or create user
    let user = database.users.find(u => u.key === key);
    
    if (!user) {
        user = {
            id: 'USER_' + crypto.randomBytes(8).toString('hex').toUpperCase(),
            username: username || 'User',
            key: key,
            loginCount: 0,
            lastLogin: null,
            created: new Date().toISOString()
        };
        database.users.push(user);
    }
    
    // Update login count
    user.loginCount++;
    user.lastLogin = new Date().toISOString();
    keyData.usageCount++;
    
    res.json({
        success: true,
        message: 'Login successful',
        user: {
            id: user.id,
            username: user.username,
            key: user.key,
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

// 3. Get Key Status
app.get('/api/user/key-status/:key', (req, res) => {
    const { key } = req.params;
    
    const keyData = database.keys.find(k => k.key === key);
    
    if (!keyData) {
        return res.status(404).json({
            success: false,
            message: 'Key not found'
        });
    }
    
    res.json({
        success: true,
        keyDetails: {
            name: keyData.name,
            isActive: keyData.isActive,
            expiry: keyData.expiry,
            usageCount: keyData.usageCount,
            maxUsage: keyData.maxUsage
        }
    });
});

// ==================== TEST ROUTES ====================

// Get all keys (public - for testing)
app.get('/api/keys', (req, res) => {
    res.json({
        total: database.keys.length,
        keys: database.keys.map(k => ({
            key: k.key,
            name: k.name,
            isActive: k.isActive,
            expiry: k.expiry
        }))
    });
});

// Get system status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        keysCount: database.keys.length,
        usersCount: database.users.length,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ==================== HOME PAGE ====================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🔑 Key Manager Server</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 30px auto; padding: 20px; background: #f0f2f5; }
                .header { text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; margin-bottom: 30px; }
                .header h1 { margin: 0; font-size: 32px; }
                .header p { margin: 10px 0 0; opacity: 0.9; }
                .box { background: white; padding: 25px; margin: 20px 0; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .box h2 { color: #333; margin-top: 0; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
                .box.admin h2 { border-color: #f093fb; }
                input { padding: 10px 15px; width: 100%; max-width: 350px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; margin: 5px 0; }
                button { padding: 10px 25px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; transition: 0.3s; }
                button:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(102,126,234,0.4); }
                button.green { background: #28a745; }
                button.green:hover { box-shadow: 0 4px 15px rgba(40,167,69,0.4); }
                .result { margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; overflow-x: auto; }
                .result pre { margin: 0; font-size: 13px; white-space: pre-wrap; word-wrap: break-word; }
                .success { color: #28a745; }
                .error { color: #dc3545; }
                .status { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; }
                .status.active { background: #d4edda; color: #155724; }
                .status.inactive { background: #f8d7da; color: #721c24; }
                .flex { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
                @media (max-width: 600px) { .flex { flex-direction: column; align-items: stretch; } input { max-width: 100%; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🔑 Key Manager Server</h1>
                <p>Admin Panel • Key Generation • User Verification</p>
            </div>
            
            <!-- Admin Panel -->
            <div class="box admin">
                <h2>🔐 Admin Panel</h2>
                <div class="flex">
                    <input id="adminUser" placeholder="Username" value="admin">
                    <input id="adminPass" placeholder="Password" value="admin123" type="password">
                    <button onclick="adminLogin()">Login</button>
                </div>
                <div id="adminResult" class="result"><pre>Login to get admin token...</pre></div>
                
                <hr style="margin: 20px 0;">
                
                <div class="flex">
                    <input id="keyName" placeholder="Key Name" value="My Key">
                    <input id="expiryDays" placeholder="Expiry Days" value="30" type="number">
                    <button class="green" onclick="generateKey()">🔑 Generate Key</button>
                </div>
                <div id="genResult" class="result"><pre>Generate a new key...</pre></div>
            </div>
            
            <!-- User Panel -->
            <div class="box">
                <h2>👤 User Panel</h2>
                <div class="flex">
                    <input id="userKey" placeholder="Enter your key">
                    <button onclick="verifyKey()">✅ Verify Key</button>
                    <button onclick="userLogin()">🔑 Login</button>
                </div>
                <div id="userResult" class="result"><pre>Enter a key to verify...</pre></div>
            </div>
            
            <!-- Status -->
            <div class="box" style="text-align:center; background:#e8f5e9;">
                <p style="margin:0;">🟢 Server is online | <span id="keyCount">0</span> keys active</p>
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
                            result.innerHTML = '<pre style="color:green;">✅ Login successful! Token: ' + data.token + '</pre>';
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
                            result.innerHTML = '<pre style="color:green;">✅ Key generated!\\n' + JSON.stringify(data.key, null, 2) + '</pre>';
                            document.getElementById('userKey').value = data.key.key;
                            updateStatus();
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
                            headers: { 'Content-Type': 'application/json' },
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
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key, username: 'User_' + Math.floor(Math.random()*1000) })
                        });
                        const data = await res.json();
                        result.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                    } catch(e) {
                        result.innerHTML = '<pre style="color:red;">❌ Error: ' + e.message + '</pre>';
                    }
                }
                
                async function updateStatus() {
                    try {
                        const res = await fetch(API_URL + '/api/keys');
                        const data = await res.json();
                        document.getElementById('keyCount').textContent = data.total || 0;
                    } catch(e) {}
                }
                
                // Update status every 10 seconds
                updateStatus();
                setInterval(updateStatus, 10000);
            </script>
        </body>
        </html>
    `);
});

// Start server
app.listen(port, () => {
    console.log('✅ Server running on port ' + port);
    console.log('🔗 http://localhost:' + port);
});