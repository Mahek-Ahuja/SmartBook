const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const db = new sqlite3.Database(path.join(__dirname, "..", "smartbook.db"));
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");
  const schema = [
    `CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('Admin','Faculty','Student')),department TEXT DEFAULT 'Computer Engineering',academic_need INTEGER DEFAULT 1,prior_cancellations INTEGER DEFAULT 0,waitlist_history INTEGER DEFAULT 0,notify_booking INTEGER DEFAULT 1,notify_reminders INTEGER DEFAULT 1,notify_waitlist INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY AUTOINCREMENT,room_name TEXT UNIQUE NOT NULL,room_type TEXT NOT NULL,capacity INTEGER NOT NULL,location TEXT NOT NULL,facilities TEXT DEFAULT '',status TEXT DEFAULT 'Available',requires_approval INTEGER DEFAULT 0,active INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id INTEGER NOT NULL,user_id INTEGER NOT NULL,booking_date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,purpose TEXT NOT NULL,status TEXT DEFAULT 'Confirmed',group_size INTEGER DEFAULT 1,group_members TEXT DEFAULT '',equipment_ids TEXT DEFAULT '',approval_comment TEXT DEFAULT '',qr_token TEXT,qr_used INTEGER DEFAULT 0,checked_in INTEGER DEFAULT 0,quick_book INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(room_id) REFERENCES rooms(id),FOREIGN KEY(user_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS equipment(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT DEFAULT 'General',quantity INTEGER DEFAULT 1,status TEXT DEFAULT 'Available',room_ids TEXT DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS equipment_bookings(id INTEGER PRIMARY KEY AUTOINCREMENT,equipment_id INTEGER NOT NULL,booking_id INTEGER NOT NULL,booking_date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,status TEXT DEFAULT 'Confirmed',FOREIGN KEY(equipment_id) REFERENCES equipment(id),FOREIGN KEY(booking_id) REFERENCES bookings(id))`,
    `CREATE TABLE IF NOT EXISTS waitlist(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id INTEGER NOT NULL,user_id INTEGER NOT NULL,booking_date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,purpose TEXT DEFAULT 'Waitlist booking',group_size INTEGER DEFAULT 1,status TEXT DEFAULT 'Waiting',offer_expires TEXT,priority_score REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(room_id) REFERENCES rooms(id),FOREIGN KEY(user_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,kind TEXT DEFAULT 'info',read INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS maintenance(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id INTEGER NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,reason TEXT NOT NULL,status TEXT DEFAULT 'Active',created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(room_id) REFERENCES rooms(id))`,
    `CREATE TABLE IF NOT EXISTS recurring_blocks(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id INTEGER NOT NULL,faculty_id INTEGER NOT NULL,day_of_week INTEGER NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,purpose TEXT NOT NULL,active INTEGER DEFAULT 1,FOREIGN KEY(room_id) REFERENCES rooms(id),FOREIGN KEY(faculty_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)`
  ];
  schema.forEach(sql => db.run(sql));
  db.get("SELECT COUNT(*) AS n FROM rooms", (err, row) => {
    if (!err && row && row.n === 0) {
      const rooms = [
        ["Library Study Room","Study Room",50,"Main Campus","Tables, Wi-Fi, Power Sockets",0],
        ["Lab 301","Lab",35,"Academic Block A","Computers, LAN, Projector",0],
        ["Lab 302","Lab",35,"Academic Block A","Computers, LAN, Smart Board",0],
        ["Lab 303","Lab",40,"Academic Block A","Computers, LAN",0],
        ["Lab 304","Lab",40,"Academic Block A","Computers, LAN, Projector",0],
        ["Lab 305","Lab",35,"Academic Block A","Computers, Whiteboard",0],
        ["Lab 306","Lab",35,"Academic Block A","Computers, Smart Board",0],
        ["Lab 307","Lab",40,"Academic Block A","Computers, Projector",0],
        ["Lab 308","Lab",40,"Academic Block A","Computers, Dual Monitors",0],
        ["Lab 309","Lab",35,"Academic Block A","Computers, Projector",0],
        ["Lab 310","Lab",45,"Academic Block A","High-spec Workstations",0],
        ["Main Auditorium","Auditorium",250,"Main Campus","Stage, Sound, Projectors",1],
        ["Amphitheatre","Amphitheatre",180,"Open Campus","Tiered Seating, Stage",1]
      ];
      const stmt = db.prepare("INSERT INTO rooms(room_name,room_type,capacity,location,facilities,requires_approval) VALUES(?,?,?,?,?,?)");
      rooms.forEach(r => stmt.run(r));
      stmt.finalize();
    }
  });
  const seedSetting = (k,v) => db.run("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)",[k,String(v)]);
  seedSetting("max_active_bookings",3);
  seedSetting("waitlist_offer_minutes",10);
  seedSetting("priority_academic_need_weight",5);
  seedSetting("priority_cancellation_weight",2);
  seedSetting("priority_waitlist_weight",1);
  db.get("SELECT COUNT(*) AS n FROM equipment", (err,row) => {
    if (!err && row && row.n === 0) {
      const stmt=db.prepare("INSERT INTO equipment(name,category,quantity,status,room_ids) VALUES(?,?,?,?,?)");
      [["Projector","AV",4,"Available","1,2,4,12,13"],["Wireless Microphone","Audio",6,"Available","12,13"],["Whiteboard Kit","Classroom",8,"Available","1,2,3,4,5,6,7,8,9,10,11"],["Lab Instrument Kit","Laboratory",5,"Available","2,3,4,5,6,7,8,9,10,11"]].forEach(x=>stmt.run(x));
      stmt.finalize();
    }
  });
});
db.allAsync=(sql,p=[])=>new Promise((resolve,reject)=>db.all(sql,p,(e,r)=>e?reject(e):resolve(r)));
db.getAsync=(sql,p=[])=>new Promise((resolve,reject)=>db.get(sql,p,(e,r)=>e?reject(e):resolve(r)));
db.runAsync=(sql,p=[])=>new Promise((resolve,reject)=>db.run(sql,p,function(e){e?reject(e):resolve({lastID:this.lastID,changes:this.changes});}));
module.exports=db;