const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Home route
app.get('/', (req, res) => {
    res.send('🚀 Server is running successfully! Auto Deploy Working!');
});

// Test route - JSON response
app.get('/test', (req, res) => {
    res.json({
        status: 'success',
        message: 'Server is working!',
        timestamp: new Date().toISOString(),
        server: 'Auto Deployer App'
    });
});

// Status route
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node: process.version
    });
});

// Start server
app.listen(port, () => {
    console.log('✅ Server running on port ' + port);
    console.log('🌐 Visit: https://auto-deployed-server.onrender.com');
});