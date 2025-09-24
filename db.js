import mysql from "mysql2";

// Konfigurasi koneksi database
const db = mysql.createConnection({
  host: "0.0.0.0",
  user: "root",
  password: "root",
  database: "pemilu"
});

// Cek koneksi database
db.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Connected to MySQL database");
  }
});

export default db;