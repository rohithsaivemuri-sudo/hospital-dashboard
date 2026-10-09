const fs = require('fs');
let content = fs.readFileSync('server/server.js', 'utf8');
content = content.replace(
  "app.use('/api/dashboard', verifyToken, dashboardRoutes);",
  "app.use('/api/dashboard', (req, res, next) => { console.log('DASHBOARD ROUTE HIT', new Date(), req.originalUrl); next(); }, verifyToken, dashboardRoutes);"
);
fs.writeFileSync('server/server.js', content);
