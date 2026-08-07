const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data file path
const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data file if not exists
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ keys: [], users: [] }, null, 2));
}

// Read data from file
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { keys: [], users: [] };
    }
}

// Write data to file
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ==================== ADMIN PANEL APIs ====================

// 1. Admin Login (Simple - you can add more security)
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    // Default admin credentials (change this!)
    if (username === 'admin' && password === 'admin123') {
        res.json({
            success: true,
            message: 'Admin login successful',
            token: 'admin_' + crypto.randomBytes(16).toString('hex')
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }
});

// 2. Generate New Key (Admin only)
app.post('/api/admin/generate-key', (req, res) => {
    const { adminToken, keyName, expiryDays } = req.body;
    
    // Verify admin token
    if (!adminToken || !adminToken.startsWith('admin_')) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized - Invalid admin token'
        });
    }
    
    // Generate unique key
    const key = 'KEY_' + crypto.randomBytes(16).toString('hex').toUpperCase();
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
    
    // Save key
    const data = readData();
    data.keys.push(newKey);
    writeData(data);
    
    res.json({
        success: true,
        message: 'Key generated successfully',
        key: newKey
    });
});

// 3. Get All Keys (Admin only)
app.get('/api/admin/keys', (req, res) => {
    const { adminToken } = req.query;
    
    if (!adminToken || !adminToken.startsWith('admin_')) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    const data = readData();
    res.json({
        success: true,
        keys: data.keys
    });
});

// 4. Delete Key (Admin only)
app.delete('/api/admin/delete-key/:key', (req, res) => {
    const { adminToken } = req.query;
    const { key } = req.params;
    
    if (!adminToken || !adminToken.startsWith('admin_')) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    const data = readData();
    data.keys = data.keys.filter(k => k.key !== key);
    writeData(data);
    
    res.json({
        success: true,
        message: 'Key deleted successfully'
    });
});

// 5. Toggle Key Status (Admin only)
app.put('/api/admin/toggle-key/:key', (req, res) => {
    const { adminToken } = req.query;
    const { key } = req.params;
    
    if (!adminToken || !adminToken.startsWith('admin_')) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    const data = readData();
    const keyData = data.keys.find(k => k.key === key);
    if (keyData) {
        keyData.isActive = !keyData.isActive;
        writeData(data);
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

// ==================== USER PANEL APIs ====================

// 1. Verify Key (User)
app.post('/api/user/verify', (req, res) => {
    const { key } = req.body;
    
    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a key'
        });
    }
    
    const data = readData();
    const keyData = data.keys.find(k => k.key === key);
    
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
    
    // Update usage count
    keyData.usageCount++;
    writeData(data);
    
    res.json({
        success: true,
        message: 'Key verified successfully',
        keyDetails: {
            name: keyData.name,
            created: keyData.created,
            expiry: keyData.expiry,
            usageCount: keyData.usageCount,
            maxUsage: keyData.maxUsage
        }
    });
});

// 2. Get Key Status (User)
app.get('/api/user/key-status/:key', (req, res) => {
    const { key } = req.params;
    
    const data = readData();
    const keyData = data.keys.find(k => k.key === key);
    
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

// 3. User Login (with key)
app.post('/api/user/login', (req, res) => {
    const { key, username } = req.body;
    
    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a key'
        });
    }
    
    // Verify key first
    const data = readData();
    const keyData = data.keys.find(k => k.key === key);
    
    if (!keyData || !keyData.isActive) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or inactive key'
        });
    }
    
    // Check if user already exists
    let user = data.users.find(u => u.key === key);
    
    if (!user) {
        // Create new user
        user = {
            id: 'USER_' + crypto.randomBytes(8).toString('hex').toUpperCase(),
            username: username || 'User',
            key: key,
            loginCount: 0,
            lastLogin: null,
            created: new Date().toISOString()
        };
        data.users.push(user);
    }
    
    // Update login count
    user.loginCount++;
    user.lastLogin = new Date().toISOString();
    keyData.usageCount++;
    writeData(data);
    
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

// 4. Get All Users (Admin only)
app.get('/api/admin/users', (req, res) => {
    const { adminToken } = req.query;
    
    if (!adminToken || !adminToken.startsWith('admin_')) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    const data = readData();
    res.json({
        success: true,
        users: data.users
    });
});

// ==================== PUBLIC ROUTE ====================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Server Key Manager</title>
            <style>
                body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
                .box { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
                h2 { color: #2196F3; }
                input { padding: 8px; width: 300px; margin: 5px 0; }
                button { padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; }
                .success { color: green; }
                .error { color: red; }
                pre { background: #f5f5f5; padding: 10px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <h1>🔑 Server Key Manager</h1>
            
            <div class="box">
                <h2>🔐 Admin Panel</h2>
                <input id="adminUser" placeholder="Username" value="admin"><br>
                <input id="adminPass" placeholder="Password" value="admin123" type="password"><br>
                <button onclick="adminLogin()">Login</button>
                <div id="adminResult"></div>
            </div>
            
            <div class="box">
                <h2>👤 User Panel</h2>
                <input id="userKey" placeholder="Enter your key"><br>
                <button onclick="verifyKey()">Verify Key</button>
                <div id="userResult"></div>
            </div>
            
            <script>
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
                        result.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                    } catch(e) {
                        result.innerHTML = '<span class="error">Error: ' + e.message + '</span>';
                    }
                }
                
                async function verifyKey() {
                    const key = document.getElementById('userKey').value;
                    const result = document.getElementById('userResult');
                    
                    if (!key) {
                        result.innerHTML = '<span class="error">Please enter a key</span>';
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
                        result.innerHTML = '<span class="error">Error: ' + e.message + '</span>';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Start server
app.listen(port, () => {
    console.log('✅ Server running on port ' + port);
    console.log('🌐 Admin Panel: http://localhost:' + port);
    console.log('🔑 API Endpoints:');
    console.log('   POST /api/admin/login - Admin login');
    console.log('   POST /api/admin/generate-key - Generate key');
    console.log('   POST /api/user/verify - Verify key');
    console.log('   POST /api/user/login - User login with key');
});