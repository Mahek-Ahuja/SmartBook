const db=require("./database/db"),bcrypt=require("bcryptjs");
const accounts=[
 ["SmartBook Admin","admin@smartbook.demo","Admin@123","Admin"],
 ["Faculty Demo","faculty@smartbook.demo","Faculty@123","Faculty"],
 ["Student Demo","student@smartbook.demo","Student@123","Student"]
];
(async()=>{
 for(const [name,email,password,role] of accounts){
  const exists=await db.getAsync("SELECT id FROM users WHERE email=?",[email]);
  if(!exists){const hash=await bcrypt.hash(password,10);await db.runAsync("INSERT INTO users(name,email,password,role,department,academic_need) VALUES(?,?,?,?,?,?)",[name,email,hash,role,"Computer Engineering",role==="Student"?3:1]);console.log("Created",email);}
  else console.log("Already exists",email);
 }
 console.log("Demo accounts ready. Start server with npm start.");
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});