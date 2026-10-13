const mysql = require('mysql2/promise');
require('dotenv').config();
const { UTC_OPTIONS, utcSessions } = require('./dbTime');

const pool = utcSessions(mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ...UTC_OPTIONS,
}));

module.exports = pool;
