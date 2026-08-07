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
        message: 'Vercel deployment working!',
        platform: 'Vercel',
        timestamp: new Date().toISOString(),
        author: 'indrajit535'
    });
});

// Status route
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node: process.version,
        platform: process.platform
    });
});

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
    app.listen(port, () => {
        console.log('✅ Server running on port ' + port);
        console.log('🌐 Visit: http://localhost:' + port);
    });
}