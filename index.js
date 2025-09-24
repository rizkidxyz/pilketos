import express from "express"
import expressLayouts from "express-ejs-layouts"
import cors from "cors"
import session from "express-session"
import { hashPassword, alertMiddleware, showMsg } from "./utils.js"
import multer from "multer"
import fs from "fs"
import path from "path"
import db from "./db.js"
import http from "http"
import { Server } from "socket.io"

const app = express()
const server = http.createServer(app)
const io = new Server(server) // socket.io server

// Middleware
app.use(cors())
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Session setup
app.use(session({
  secret: "secret_key_rahasia",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}))

app.use((req, res, next) => {
  res.locals.user = req.session.user || null
  next()
})
app.use(alertMiddleware)

// EJS setup
app.use(expressLayouts)
app.set("view engine", "ejs")
app.set("views", "./views")

const __dirname = path.resolve()
app.use("/assets", express.static(path.join(__dirname, "assets")))

function isAdmin(req, res, next) {
  const user = req.session.user
  if (!user || user.admin !== "true") {
    return res.redirect("/")
  }
  next()
}

function isLogin(req, res, next){
  const user = req.session.user
  if(!user){
    return res.redirect("/")
  }
  next()
}

// Konfigurasi multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), "assets"))
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
})
const upload = multer({ storage })

// ===== SOCKET.IO =====
io.on("connection", (socket) => {
  console.log("🔗 Client connected:", socket.id)

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id)
  })
})

// helper broadcast ke semua client
function broadcastUpdatePeserta() {
  db.query("SELECT nama, kelas, voted FROM users ORDER BY nama", (err, result) => {
    if (!err) {
      io.emit("updatePeserta", result)
    }
  })
}

// ROUTES
app.get("/", (req, res) => {
  res.render("index", { title: "SIPEMILU 2025" })
})

app.get("/login", (req, res) => {
  res.render("login", { title: "Login ~ SiPemilu" })
})

app.get("/daftar", (req, res) => {
  const allKelas = generateAllKelas()
  res.render("daftar", { title: "Daftar ~ SiPemilu", allKelas })
})
// 🔹 Helper untuk membangun query filter peserta
function buildPesertaQuery({ page = 1, limit = 50, search = "", voted = "all", kelas = "" }) {
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  let where = "WHERE 1=1";
  let params = [];

  if (search) {
    where += " AND nama LIKE ?";
    params.push(`%${search}%`);
  }
  if (kelas) {
    where += " AND kelas = ?";
    params.push(kelas);
  }
  if (voted === "yes") {
    where += " AND voted IS NOT NULL";
  } else if (voted === "no") {
    where += " AND voted IS NULL";
  }

  return { where, params, page, limit, offset };
}

function generateAllKelas() {
  const tingkat = ["X", "XI", "XII"];
  let kelas = [];
  
  kelas.push("Guru/Karyawan");
  tingkat.forEach(t => {
    for (let i = 1; i <= 9; i++) {
      kelas.push(`${t}-${i}`);
    }
  });
  return kelas;
}
// GET data kandidat
app.get("/tambah-kandidat", isAdmin, (req,res)=>{
  res.render("./components/form-kandidat",{
    title: "Tambah Data Kandidat"
  })
})
app.get("/kandidat", (req, res) => {
  const sql = "SELECT * FROM kandidat"; // tampilkan terbaru dulu
  db.query(sql, (err, result) => {
    if (err) {
      console.error("❌ Error ambil kandidat:", err);
      req.session.alert = showMsg("error", "Gagal mengambil data kandidat");
      return res.redirect("/");
    }

    // Debug kalau result kosong
    if (result.length === 0) {
      console.log("⚠️ Tidak ada kandidat di database");
    }

    res.render("data-kandidat", {
      title: "Daftar Kandidat",
      data: result
    });
  });
});
// API kandidat (untuk realtime)
app.get("/api/kandidat", (req, res) => {
  const sql = "SELECT * FROM kandidat";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("❌ Error API kandidat:", err);
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: result });
  });
});
app.post("/tambah-kandidat", isAdmin, upload.single("foto"), (req, res) => {
  let { nomor, nama, visi, misi, detail } = req.body;
  nama = nama.toLowerCase();

  if (!nomor || !nama || !visi || !misi) {
    if (req.file) fs.unlinkSync(req.file.path); // hapus file jika form tidak lengkap
    req.session.alert = showMsg("warning", "Harap isi semua bidang!");
    return res.redirect("/tambah-kandidat");
  }

  // cek nomor kandidat sudah ada
  const checkSql = "SELECT * FROM kandidat WHERE nomor = ?";
  db.query(checkSql, [nomor], (err, result) => {
    if (err) {
      if (req.file) fs.unlinkSync(req.file.path);
      console.error("❌ Error cek kandidat:", err);
      req.session.alert = showMsg("error", "Terjadi kesalahan server!");
      return res.redirect("/tambah-kandidat");
    }

    if (result.length > 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      req.session.alert = showMsg("warning", `Nomor ${nomor} sudah digunakan!`);
      return res.redirect("/tambah-kandidat");
    }

    // rename foto jadi nomor.ext
    const ext = path.extname(req.file.originalname);
    const newFilename = `${nomor}${ext}`;
    const newPath = path.join(process.cwd(), "assets", newFilename);
    fs.renameSync(req.file.path, newPath);

    const fotoPath = `/assets/${newFilename}`;

    // simpan ke DB
    const insertSql =
      "INSERT INTO kandidat (nomor, ft, nama, visi, misi, detail) VALUES (?, ?, ?, ?, ?, ?)";
    db.query(insertSql, [nomor, fotoPath, nama, visi, misi, detail || null], (err2) => {
      if (err2) {
        if (fs.existsSync(newPath)) fs.unlinkSync(newPath); // hapus file kalau gagal
        console.error("❌ Error insert kandidat:", err2);
        req.session.alert = showMsg("error", "Server error, hubungi administrator");
        return res.redirect("/tambah-kandidat");
      }

      // broadcast realtime ke semua client
      io.emit("updateKandidat");
      req.session.alert = showMsg("success", "Berhasil Tambah Kandidat");
      return res.redirect("/kandidat");
    });
  });
});
// API kandidat untuk realtime reload tabel

app.get("/data/peserta", (req, res) => {  
  let { page = 1, limit = 50, search = "", voted = "all", kelas = "" } = req.query;  
  page = parseInt(page);  
  limit = parseInt(limit);  
  const offset = (page - 1) * limit;  
  
  let where = "WHERE 1=1";  
  let params = [];  
  
  if (search) {  
    where += " AND nama LIKE ?";  
    params.push(`%${search}%`);  
  }  
  
  if (kelas) {  
    where += " AND kelas = ?";  
    params.push(kelas);  
  }  
  
  if (voted === "yes") {  
    where += " AND voted IS NOT NULL";  
  } else if (voted === "no") {  
    where += " AND voted IS NULL";  
  }  
  
  const countSql = `SELECT COUNT(*) as total FROM users ${where}`;  
  db.query(countSql, params, (errCount, countResult) => {  
    if (errCount) {  
      console.error(errCount);  
      return res.redirect("/");  
    }  
  
    const total = countResult[0].total;  
    const totalPages = Math.ceil(total / limit);  
    const sql = `SELECT id, nama, kelas, voted FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
    db.query(sql, [...params, limit, offset], (err, result) => {  
      if (err) {  
        console.error(err);  
        return res.redirect("/");  
      }  

      // ✅ Generate daftar kelas TANPA QUERY DB — hanya pakai function
      const allKelas = generateAllKelas();

      res.render("data-peserta", {  
        title: "Data Peserta",  
        data: result,  
        page,  
        totalPages,  
        limit,  
        search,  
        voted,  
        kelas,  
        allKelas  // ✅ Kirim array string ke EJS
      });  
    });  
  });  
});
// 🔹 Endpoint API JSON (dipakai realtime client
app.get("/api/peserta", (req, res) => {  
  let { page = 1, limit = 50, search = "", voted = "all", kelas = "" } = req.query;  
  page = parseInt(page);  
  limit = parseInt(limit);  
  const offset = (page - 1) * limit;  
  
  let where = "WHERE 1=1";  
  let params = [];  
  
  if (search) {  
    where += " AND nama LIKE ?";  
    params.push(`%${search}%`);  
  }  
  if (kelas) {  
    where += " AND kelas = ?";  
    params.push(kelas);  
  }  
  if (voted === "yes") {  
    where += " AND voted IS NOT NULL";  
  } else if (voted === "no") {  
    where += " AND voted IS NULL";  
  }  
  
  const countSql = `SELECT COUNT(*) as total FROM users ${where}`;  
  db.query(countSql, params, (errCount, countResult) => {  
    if (errCount) {  
      return res.json({ success: false, error: errCount.message });  
    }  
  
    const total = countResult[0].total;  
    const totalPages = Math.ceil(total / limit);  
    const sql = `SELECT id, nama, kelas, voted FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
    db.query(sql, [...params, limit, offset], (err, result) => {  
      if (err) {  
        return res.json({ success: false, error: err.message });  
      }  
      res.json({ success: true, data: result, total, totalPages, page, limit });  
    });  
  });  
});
// tambah peserta
app.post("/daftar", (req, res) => {
  let { nama, kelas, password } = req.body
  nama = nama.toLowerCase()
  
  if (!nama || !kelas || !password) {
    req.session.alert = showMsg("warning", "Harap isi bidang kosong!")
    return res.redirect("/daftar")
  }

  const checkSql = "SELECT * FROM users WHERE nama = ?"
  db.query(checkSql, [nama], (err, result) => {
    if (err) {
      console.error("❌ Error cek user:", err)
      req.session.alert = showMsg("error", "Terjadi kesalahan server!")
      return res.redirect("/daftar")
    }

    if (result.length > 0) {
      req.session.alert = showMsg(
        "warning",
        `Nama ${nama.toUpperCase()} sudah digunakan oleh kelas ${result[0].kelas}`
      )
      return res.redirect("/daftar")
    }

    const hashedPassword = hashPassword(password)
    const insertSql = "INSERT INTO users (nama, kelas, password) VALUES (?, ?, ?)"
    db.query(insertSql, [nama, kelas, hashedPassword], (err2) => {
      if (err2) {
        console.error("❌ Error insert user:", err2)
        req.session.alert = showMsg("error", "Server error harap hubungi administrator")
        return res.redirect("/daftar")
      }

      // setelah berhasil insert → broadcast ke semua client
      broadcastUpdatePeserta()

      req.session.alert = showMsg("success", "Berhasil daftar, silakan login")
      return res.redirect("/login")
    })
  })
})

// login
app.post("/login", (req, res) => {
  let { nama, password } = req.body
  nama = nama.toLowerCase()

  if (!nama || !password) {
    req.session.alert = showMsg("error", "Harap isi bidang kosong!")
    return res.redirect("/login")
  }

  const sql = "SELECT * FROM users WHERE nama = ?"
  db.query(sql, [nama], (err, results) => {
    if (err) {
      console.error(err)
      req.session.alert = showMsg("error", "Error kesalahan server")
      return res.redirect("/login")
    }

    if (results.length === 0) {
      req.session.alert = showMsg("error", "Nama atau Password Salah!")
      return res.redirect("/login")
    }

    const user = results[0]
    const hashedInput = hashPassword(password)

    if (hashedInput !== user.password) {
      req.session.alert = showMsg("error", "Nama atau Password Salah!")
      return res.redirect("/login")
    }

    req.session.user = { id: user.id, nama: user.nama, kelas: user.kelas, admin: user.admin, voted: user.voted }
    req.session.alert = showMsg("success", "Berhasil Login")
    res.redirect("/")
  })
})

app.post("/vote-kandidat", isLogin, (req, res) => {
  const { kandidatId } = req.body
  const userId = req.session.user.id  // ambil dari session

  // cek input kandidatId
  if (!kandidatId) {
    req.session.alert = showMsg("error", "Kandidat tidak ditemukan")
    return res.redirect("/kandidat")
  }

  // cek kandidat valid
  const sqlKandidat = "SELECT * FROM kandidat WHERE id = ?"
  db.query(sqlKandidat, [kandidatId], (err, kandidatResults) => {
    if (err) {
      console.error(err)
      req.session.alert = showMsg("error", "Kesalahan server saat cek kandidat")
      return res.redirect("/kandidat")
    }

    if (kandidatResults.length === 0) {
      req.session.alert = showMsg("error", "Kandidat tidak valid")
      return res.redirect("/kandidat")
    }

    // cek user
    const sqlUser = "SELECT * FROM users WHERE id=?"
    db.query(sqlUser, [userId], (err, userResults) => {
      if (err) {
        console.error(err)
        req.session.alert = showMsg("error", "Kesalahan server saat cek user")
        return res.redirect("/kandidat")
      }

      if (userResults.length === 0) {
        req.session.alert = showMsg("error", "Pengguna tidak terdaftar")
        return res.redirect("/kandidat")
      }

      const user = userResults[0]

      if (user.voted) {
        req.session.alert = showMsg("error", "Anda sudah memilih dan tidak dapat memilih lagi!")
        return res.redirect("/kandidat")
      }

      // Mulai transaction
      db.beginTransaction((err) => {
        if (err) {
          console.error(err)
          req.session.alert = showMsg("error", "Server gagal memproses data")
          return res.redirect("/kandidat")
        }
        // 1. Update user (tandai sudah vote)
        const sqlUpdateUser = "UPDATE users SET voted = ? WHERE id = ?"
        db.query(sqlUpdateUser, [true, userId], (err, updateUserResult) => {
          if (err) {
            return db.rollback(() => {
              console.error(err)
              req.session.alert = showMsg("error", "Gagal update status user")
              return res.redirect("/kandidat")
            })
          }
          // 2. Update kandidat (tambah suara)
          const updateKandidat = "UPDATE kandidat SET suara = suara + 1 WHERE id=?"
          db.query(updateKandidat, [kandidatId], (err, updateKandidatResult) => {
            if (err) {
              return db.rollback(() => {
                console.error(err)
                req.session.alert = showMsg("error", "Gagal menambah suara kandidat")
                return res.redirect("/kandidat")
              })
            }

            //Commit transaksi kalau dua-duanya berhasil
            db.commit((err) => {
              if (err) {
                return db.rollback(() => {
                  console.error(err)
                  req.session.alert = showMsg("error", "Gagal voting, Kesalahan server")
                  return res.redirect("/kandidat")
                })
              }
              io.emit("updateCounter")
              req.session.alert = showMsg("success", "Berhasil memilih! Terima kasih")
              return res.redirect("/quick-count")
            })
          })
        })
      })
    })
  })
})

app.get("/quick-count", (req, res)=>{
  const sql = "SELECT * FROM kandidat"
  db.query(sql, (err, result) => {
    if (err) {
      console.error("❌ Error ambil kandidat:", err);
      req.session.alert = showMsg("error", "Gagal mengambil data kandidat");
      return res.redirect("/");
    }

    // Debug kalau result kosong
    if (result.length === 0) {
      console.log("⚠️ Tidak ada kandidat di database");
    }

    res.render("qc", {
      title: "Quick Count",
      data: result
    });
  });
})

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"))
})

app.use((req, res) => res.redirect("/"))

// ===== Jalankan server =====
const PORT = 3000
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`)
})