const express=require("express"), path=require("path"), bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken"), QRCode=require("qrcode"), cron=require("node-cron");
const db=require("./database/db");
const app=express(), PORT=process.env.PORT||3000, SECRET=process.env.JWT_SECRET||"smartbook-demo-secret-change-before-deployment";
app.use(express.json()); app.use(express.urlencoded({extended:true})); app.use(express.static(path.join(__dirname,"public")));
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const tokenFor=u=>jwt.sign({id:u.id,role:u.role,name:u.name,email:u.email},SECRET,{expiresIn:"12h"});
async function notify(userId,title,message,kind="info"){
 const u=await db.getAsync("SELECT notify_booking,notify_reminders,notify_waitlist FROM users WHERE id=?",[userId]);
 if(u){const enabled=kind==="reminder"?u.notify_reminders:(kind==="waitlist"?u.notify_waitlist:u.notify_booking);if(!enabled)return;}
 await db.runAsync("INSERT INTO notifications(user_id,title,message,kind) VALUES(?,?,?,?)",[userId,title,message,kind]);
}
async function userFrom(req){const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))return null;try{return jwt.verify(h.slice(7),SECRET);}catch{return null;}}
const auth=asyncRoute(async(req,res,next)=>{req.user=await userFrom(req);if(!req.user)return res.status(401).json({error:"Please log in first."});next();});
const roles=(...allowed)=> (req,res,next)=>allowed.includes(req.user.role)?next():res.status(403).json({error:"This feature is not available for your role."});
const overlap=(a,b,c,d)=>a<d&&b>c;
const today=()=>new Date().toISOString().slice(0,10);
async function priority(userId){const u=await db.getAsync("SELECT * FROM users WHERE id=?",[userId]);if(!u)return 0;const s=await db.allAsync("SELECT value FROM settings WHERE key LIKE 'priority_%'");const cfg={};s.forEach(x=>{});const get=async(k,d)=>Number((await db.getAsync("SELECT value FROM settings WHERE key=?",[k]))?.value||d);return u.academic_need*await get("priority_academic_need_weight",5)-u.prior_cancellations*await get("priority_cancellation_weight",2)+u.waitlist_history*await get("priority_waitlist_weight",1);}
async function slotConflicts(roomId,date,start,end,ignoreId=null){
 const params=[roomId,date,end,start];let sql="SELECT id FROM bookings WHERE room_id=? AND booking_date=? AND status IN ('Confirmed','Pending','Checked In') AND start_time < ? AND end_time > ?";
 if(ignoreId){sql+=" AND id<>?";params.push(ignoreId);}
 const b=await db.getAsync(sql,params);if(b)return "This room already has a booking that overlaps this time.";
 const m=await db.getAsync("SELECT id FROM maintenance WHERE room_id=? AND status='Active' AND start_date<=? AND end_date>=?",[roomId,date,date]);if(m)return "This room is marked unavailable for maintenance on this date.";
 const r=await db.getAsync("SELECT id FROM recurring_blocks WHERE room_id=? AND active=1 AND day_of_week=? AND start_time < ? AND end_time > ?",[roomId,new Date(date+"T00:00:00").getDay(),end,start]);if(r)return "This room is blocked for a recurring faculty schedule.";
 return null;
}
async function promoteWaitlist(roomId,date,start,end){
 const list=await db.allAsync("SELECT w.*,u.name,u.email FROM waitlist w JOIN users u ON u.id=w.user_id WHERE w.room_id=? AND w.booking_date=? AND w.start_time=? AND w.end_time=? AND w.status='Waiting' ORDER BY w.priority_score DESC,w.created_at ASC",[roomId,date,start,end]);
 for(const w of list){
   const minutes=Number((await db.getAsync("SELECT value FROM settings WHERE key='waitlist_offer_minutes'"))?.value||10);
   const expiry=new Date(Date.now()+minutes*60000).toISOString();
   await db.runAsync("UPDATE waitlist SET status='Offered',offer_expires=? WHERE id=?",[expiry,w.id]);
   await notify(w.user_id,"A room slot is available",`Your waitlisted slot is now offered. Accept it within ${minutes} minutes. Waitlist ID: ${w.id}`,"waitlist");
   break;
 }
}
app.get("/api/health",(req,res)=>res.json({status:"ok",service:"SmartBook Full SRS Demo"}));

app.post("/api/auth/register",asyncRoute(async(req,res)=>{
 const {name,email,password,role="Student",department="Computer Engineering"}=req.body;
 if(!name||!email||!password||password.length<6)return res.status(400).json({error:"Name, valid email and password (at least 6 characters) are required."});
 if(!["Student","Faculty"].includes(role))return res.status(400).json({error:"Public registration supports Student and Faculty. Admin is seeded for demo."});
 const hash=await bcrypt.hash(password,10);
 try{const x=await db.runAsync("INSERT INTO users(name,email,password,role,department) VALUES(?,?,?,?,?)",[name.trim(),email.toLowerCase().trim(),hash,role,department]);const u=await db.getAsync("SELECT id,name,email,role,department FROM users WHERE id=?",[x.lastID]);res.status(201).json({token:tokenFor(u),user:u});}
 catch(e){res.status(409).json({error:"This email is already registered."});}
}));
app.post("/api/auth/login",asyncRoute(async(req,res)=>{
 const {email,password}=req.body;const u=await db.getAsync("SELECT * FROM users WHERE LOWER(email)=LOWER(?)",[email||""]);
 if(!u||!(await bcrypt.compare(password||"",u.password)))return res.status(401).json({error:"Invalid email or password."});
 const safe={id:u.id,name:u.name,email:u.email,role:u.role,department:u.department};res.json({token:tokenFor(safe),user:safe});
}));
app.get("/api/auth/me",auth,asyncRoute(async(req,res)=>{const u=await db.getAsync("SELECT id,name,email,role,department FROM users WHERE id=?",[req.user.id]);res.json(u);}));
app.post("/api/auth/logout",auth,(req,res)=>res.json({message:"Logged out. Remove the token from this browser."}));

app.get("/api/rooms",asyncRoute(async(req,res)=>{
 const {type,capacity,date,start,end}=req.query;let sql="SELECT * FROM rooms WHERE active=1",p=[];
 if(type&&type!=="All"){sql+=" AND room_type=?";p.push(type);}if(capacity){sql+=" AND capacity>=?";p.push(Number(capacity));}
 const rows=await db.allAsync(sql+" ORDER BY room_name",p);
 if(date&&start&&end){for(const r of rows){r.available=!await slotConflicts(r.id,date,start,end)&&r.status==="Available";}}
 res.json(rows);
}));
app.post("/api/rooms",auth,roles("Admin"),asyncRoute(async(req,res)=>{
 const {room_name,room_type,capacity,location,facilities,requires_approval}=req.body;
 if(!room_name||!room_type||!capacity||!location)return res.status(400).json({error:"Room name, type, capacity and location are required."});
 const x=await db.runAsync("INSERT INTO rooms(room_name,room_type,capacity,location,facilities,requires_approval) VALUES(?,?,?,?,?,?)",[room_name,room_type,capacity,location,facilities||"",requires_approval?1:0]);res.status(201).json(await db.getAsync("SELECT * FROM rooms WHERE id=?",[x.lastID]));
}));
app.put("/api/rooms/:id",auth,roles("Admin"),asyncRoute(async(req,res)=>{
 const {room_name,room_type,capacity,location,facilities,status,requires_approval,active}=req.body;
 await db.runAsync("UPDATE rooms SET room_name=COALESCE(?,room_name),room_type=COALESCE(?,room_type),capacity=COALESCE(?,capacity),location=COALESCE(?,location),facilities=COALESCE(?,facilities),status=COALESCE(?,status),requires_approval=COALESCE(?,requires_approval),active=COALESCE(?,active) WHERE id=?",[room_name,room_type,capacity,location,facilities,status,requires_approval,active,req.params.id]);res.json({message:"Space updated."});
}));
app.delete("/api/rooms/:id",auth,roles("Admin"),asyncRoute(async(req,res)=>{await db.runAsync("UPDATE rooms SET active=0,status='Unavailable' WHERE id=?",[req.params.id]);res.json({message:"Space deactivated."});}));

app.get("/api/recommendations",auth,asyncRoute(async(req,res)=>{
 const date=req.query.date||today(),start=req.query.start||"10:00",end=req.query.end||"11:00",size=Number(req.query.group_size||1);
 const rooms=await db.allAsync("SELECT * FROM rooms WHERE active=1 AND status='Available' AND capacity>=?",[size]);
 const ranked=[];
 for(const r of rooms){if(!await slotConflicts(r.id,date,start,end)){const prior=await db.getAsync("SELECT COUNT(*) n FROM bookings WHERE user_id=? AND room_id=?",[req.user.id,r.id]);ranked.push({...r,score:100-(r.capacity-size)*0.2+(prior.n?5:0),reason:prior.n?"Previously used space":"Available and matches group size"});}}
 ranked.sort((a,b)=>b.score-a.score);res.json(ranked);
}));
app.post("/api/quick-book",auth,asyncRoute(async(req,res)=>{
 const {room_id,duration=60,purpose="Quick drop-in"}=req.body;const start=new Date(),end=new Date(start.getTime()+Number(duration)*60000),date=start.toISOString().slice(0,10),st=start.toTimeString().slice(0,5),et=end.toTimeString().slice(0,5);
 const conflict=await slotConflicts(Number(room_id),date,st,et);if(conflict)return res.status(409).json({error:conflict});
 const room=await db.getAsync("SELECT * FROM rooms WHERE id=? AND active=1 AND status='Available'",[room_id]);if(!room)return res.status(404).json({error:"Space unavailable."});
 const qr=require("crypto").randomBytes(24).toString("hex");
 const x=await db.runAsync("INSERT INTO bookings(room_id,user_id,booking_date,start_time,end_time,purpose,quick_book,qr_token) VALUES(?,?,?,?,?,?,1,?)",[room_id,req.user.id,date,st,et,purpose,qr]);
 res.status(201).json({message:"Quick booking confirmed.",id:x.lastID});
}));

app.get("/api/bookings",auth,asyncRoute(async(req,res)=>{
 let sql="SELECT b.*,r.room_name,r.room_type,u.name,u.email FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN users u ON u.id=b.user_id WHERE 1=1",p=[];
 if(req.user.role==="Student") {sql+=" AND b.user_id=?";p.push(req.user.id);}
 else if(req.query.mine==="true"){sql+=" AND b.user_id=?";p.push(req.user.id);}
 if(req.query.status){sql+=" AND b.status=?";p.push(req.query.status);}
 res.json(await db.allAsync(sql+" ORDER BY b.booking_date DESC,b.start_time",p));
}));
app.post("/api/bookings",auth,asyncRoute(async(req,res)=>{
 const {room_id,booking_date,start_time,end_time,purpose,group_size=1,group_members="",equipment_ids=[]}=req.body;
 if(!room_id||!booking_date||!start_time||!end_time||start_time>=end_time||!purpose)return res.status(400).json({error:"Complete all booking fields and enter a valid time range."});
 if(booking_date<today())return res.status(400).json({error:"Past dates cannot be booked."});
 const room=await db.getAsync("SELECT * FROM rooms WHERE id=? AND active=1",[room_id]);if(!room||room.status!=="Available")return res.status(404).json({error:"Room is unavailable."});
 if(Number(group_size)>room.capacity)return res.status(400).json({error:"Group size exceeds room capacity."});
 const active=await db.getAsync("SELECT COUNT(*) n FROM bookings WHERE user_id=? AND status IN ('Confirmed','Pending','Checked In')",[req.user.id]);
 const max=Number((await db.getAsync("SELECT value FROM settings WHERE key='max_active_bookings'"))?.value||3);
 if(req.user.role==="Student"&&active.n>=max)return res.status(400).json({error:`Active booking limit reached (${max}).`});
 const conflict=await slotConflicts(room.id,booking_date,start_time,end_time);if(conflict)return res.status(409).json({error:conflict,can_waitlist:true});
 const ids=Array.isArray(equipment_ids)?equipment_ids:[];
 for(const id of ids){const c=await db.getAsync("SELECT id FROM equipment_bookings WHERE equipment_id=? AND booking_date=? AND status='Confirmed' AND start_time < ? AND end_time > ?",[id,booking_date,end_time,start_time]);if(c)return res.status(409).json({error:`Equipment ${id} is already reserved for this time.`});}
 const status=room.requires_approval?"Pending":"Confirmed",qr=require("crypto").randomBytes(24).toString("hex");
 const x=await db.runAsync("INSERT INTO bookings(room_id,user_id,booking_date,start_time,end_time,purpose,status,group_size,group_members,equipment_ids,qr_token) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[room.id,req.user.id,booking_date,start_time,end_time,purpose,status,group_size,group_members,ids.join(","),qr]);
 for(const id of ids)await db.runAsync("INSERT INTO equipment_bookings(equipment_id,booking_id,booking_date,start_time,end_time) VALUES(?,?,?,?,?)",[id,x.lastID,booking_date,start_time,end_time]);
 if(status==="Pending"){const approvers=await db.allAsync("SELECT id FROM users WHERE role IN ('Admin','Faculty')");for(const a of approvers)await notify(a.id,"Booking approval required",`Booking #${x.lastID} requires review.`,"approval");}
 await notify(req.user.id,"Booking submitted",`Your booking #${x.lastID} is ${status.toLowerCase()}.`, "booking");
 res.status(201).json({id:x.lastID,status,message:status==="Pending"?"Request sent for approval.":"Booking confirmed."});
}));
app.put("/api/bookings/:id",auth,asyncRoute(async(req,res)=>{
 const b=await db.getAsync("SELECT * FROM bookings WHERE id=?",[req.params.id]);if(!b)return res.status(404).json({error:"Booking not found."});
 if(req.user.role==="Student"&&b.user_id!==req.user.id)return res.status(403).json({error:"Not your booking."});
 const {booking_date,start_time,end_time,purpose}=req.body;
 const conflict=await slotConflicts(b.room_id,booking_date||b.booking_date,start_time||b.start_time,end_time||b.end_time,b.id);if(conflict)return res.status(409).json({error:conflict});
 await db.runAsync("UPDATE bookings SET booking_date=?,start_time=?,end_time=?,purpose=?,status='Pending' WHERE id=?",[booking_date||b.booking_date,start_time||b.start_time,end_time||b.end_time,purpose||b.purpose,b.id]);
 await notify(b.user_id,"Booking modified","Your modified booking is awaiting approval.","booking");res.json({message:"Booking update submitted for approval."});
}));
app.delete("/api/bookings/:id",auth,asyncRoute(async(req,res)=>{
 const b=await db.getAsync("SELECT * FROM bookings WHERE id=?",[req.params.id]);if(!b)return res.status(404).json({error:"Booking not found."});
 if(req.user.role==="Student"&&b.user_id!==req.user.id)return res.status(403).json({error:"Not your booking."});
 if(req.query.permanent==="true"||b.status==="Cancelled"){
  await db.runAsync("DELETE FROM equipment_bookings WHERE booking_id=?",[b.id]);
  await db.runAsync("DELETE FROM bookings WHERE id=?",[b.id]);
  return res.json({message:"Cancelled booking permanently deleted."});
 }
 await db.runAsync("UPDATE bookings SET status='Cancelled' WHERE id=?",[b.id]);await db.runAsync("UPDATE equipment_bookings SET status='Cancelled' WHERE booking_id=?",[b.id]);await db.runAsync("UPDATE users SET prior_cancellations=prior_cancellations+1 WHERE id=?",[b.user_id]);
 await notify(b.user_id,"Booking cancelled",`Booking #${b.id} has been cancelled.`,"booking");await promoteWaitlist(b.room_id,b.booking_date,b.start_time,b.end_time);res.json({message:"Booking cancelled. Waitlist promotion checked."});
}));
app.get("/api/bookings/:id/qr",auth,asyncRoute(async(req,res)=>{
 const b=await db.getAsync("SELECT * FROM bookings WHERE id=?",[req.params.id]);if(!b)return res.status(404).json({error:"Booking not found."});
 if(req.user.role==="Student"&&b.user_id!==req.user.id)return res.status(403).json({error:"Not your booking."});
 let token=b.qr_token;
 if(!token){
   token=require("crypto").randomBytes(24).toString("hex");
   await db.runAsync("UPDATE bookings SET qr_token=? WHERE id=?",[token,b.id]);
 }
 const data=JSON.stringify({bookingId:b.id,token:token,status:b.status});
 res.json({qr:await QRCode.toDataURL(data),validFrom:`${b.booking_date} ${b.start_time}`,validUntil:`${b.booking_date} ${b.end_time}`,status:b.status});
}));
app.post("/api/qr/verify",auth,roles("Admin","Faculty"),asyncRoute(async(req,res)=>{
 const {token}=req.body;const b=await db.getAsync("SELECT * FROM bookings WHERE qr_token=?",[token]);
 if(!b||b.status!=="Confirmed"||b.qr_used||b.qr_token==null)return res.status(400).json({valid:false,message:"QR code is invalid, expired, cancelled or already used."});
 const now=new Date(),start=new Date(`${b.booking_date}T${b.start_time}:00`),end=new Date(`${b.booking_date}T${b.end_time}:00`);
 if(now<start||now>end)return res.status(400).json({valid:false,message:"QR code is outside its booking time window."});
 await db.runAsync("UPDATE bookings SET qr_used=1,checked_in=1,status='Checked In' WHERE id=?",[b.id]);res.json({valid:true,message:"Access verified. Booking checked in."});
}));

app.post("/api/waitlist",auth,asyncRoute(async(req,res)=>{
 const {room_id,booking_date,start_time,end_time,purpose,group_size=1}=req.body;
 const room=await db.getAsync("SELECT * FROM rooms WHERE id=?",[room_id]);if(!room)return res.status(404).json({error:"Room not found."});
 const score=await priority(req.user.id);
 const x=await db.runAsync("INSERT INTO waitlist(room_id,user_id,booking_date,start_time,end_time,purpose,group_size,priority_score) VALUES(?,?,?,?,?,?,?,?)",[room_id,req.user.id,booking_date,start_time,end_time,purpose||"Waitlist",group_size,score]);
 const pos=await db.getAsync("SELECT COUNT(*) n FROM waitlist WHERE room_id=? AND booking_date=? AND start_time=? AND end_time=? AND status='Waiting' AND (priority_score>? OR (priority_score=? AND created_at<=(SELECT created_at FROM waitlist WHERE id=?)))",[room_id,booking_date,start_time,end_time,score,score,x.lastID]);
 await db.runAsync("UPDATE users SET waitlist_history=waitlist_history+1 WHERE id=?",[req.user.id]);res.status(201).json({id:x.lastID,position:pos.n,message:"Added to waitlist."});
}));
app.get("/api/waitlist",auth,asyncRoute(async(req,res)=>{
 let sql="SELECT w.*,r.room_name,u.name,u.email FROM waitlist w JOIN rooms r ON r.id=w.room_id JOIN users u ON u.id=w.user_id WHERE 1=1",p=[];
 if(req.user.role==="Student"){sql+=" AND w.user_id=?";p.push(req.user.id);}
 res.json(await db.allAsync(sql+" ORDER BY w.priority_score DESC,w.created_at ASC",p));
}));
app.post("/api/waitlist/:id/accept",auth,asyncRoute(async(req,res)=>{
 const w=await db.getAsync("SELECT * FROM waitlist WHERE id=?",[req.params.id]);if(!w||w.user_id!==req.user.id||w.status!=="Offered")return res.status(404).json({error:"No active offer found."});
 if(new Date(w.offer_expires)<new Date()){await db.runAsync("UPDATE waitlist SET status='Expired' WHERE id=?",[w.id]);await promoteWaitlist(w.room_id,w.booking_date,w.start_time,w.end_time);return res.status(400).json({error:"Offer expired."});}
 const conflict=await slotConflicts(w.room_id,w.booking_date,w.start_time,w.end_time);if(conflict)return res.status(409).json({error:conflict});
 const qr=require("crypto").randomBytes(24).toString("hex");const x=await db.runAsync("INSERT INTO bookings(room_id,user_id,booking_date,start_time,end_time,purpose,qr_token) VALUES(?,?,?,?,?,?,?)",[w.room_id,w.user_id,w.booking_date,w.start_time,w.end_time,w.purpose,qr]);
 await db.runAsync("UPDATE waitlist SET status='Accepted' WHERE id=?",[w.id]);await notify(w.user_id,"Waitlist booking confirmed",`Your booking #${x.lastID} is confirmed.`,"booking");res.json({message:"Offer accepted. Booking confirmed.",bookingId:x.lastID});
}));
app.post("/api/waitlist/:id/decline",auth,asyncRoute(async(req,res)=>{const w=await db.getAsync("SELECT * FROM waitlist WHERE id=?",[req.params.id]);if(!w||w.user_id!==req.user.id)return res.status(404).json({error:"Waitlist entry not found."});await db.runAsync("UPDATE waitlist SET status='Declined' WHERE id=?",[w.id]);await promoteWaitlist(w.room_id,w.booking_date,w.start_time,w.end_time);res.json({message:"Offer declined. Next user considered."});}));

app.get("/api/equipment",auth,asyncRoute(async(req,res)=>res.json(await db.allAsync("SELECT * FROM equipment ORDER BY name"))));
app.post("/api/equipment",auth,roles("Admin"),asyncRoute(async(req,res)=>{const {name,category,quantity=1,status="Available",room_ids=""}=req.body;if(!name)return res.status(400).json({error:"Equipment name is required."});const x=await db.runAsync("INSERT INTO equipment(name,category,quantity,status,room_ids) VALUES(?,?,?,?,?)",[name,category||"General",quantity,status,room_ids]);res.status(201).json(await db.getAsync("SELECT * FROM equipment WHERE id=?",[x.lastID]));}));
app.put("/api/equipment/:id",auth,roles("Admin"),asyncRoute(async(req,res)=>{const {name,category,quantity,status,room_ids}=req.body;await db.runAsync("UPDATE equipment SET name=COALESCE(?,name),category=COALESCE(?,category),quantity=COALESCE(?,quantity),status=COALESCE(?,status),room_ids=COALESCE(?,room_ids) WHERE id=?",[name,category,quantity,status,room_ids,req.params.id]);res.json({message:"Equipment updated."});}));
app.delete("/api/equipment/:id",auth,roles("Admin"),asyncRoute(async(req,res)=>{await db.runAsync("DELETE FROM equipment WHERE id=?",[req.params.id]);res.json({message:"Equipment removed."});}));

app.post("/api/maintenance",auth,roles("Admin"),asyncRoute(async(req,res)=>{
 const {room_id,start_date,end_date,reason}=req.body;if(!room_id||!start_date||!end_date||start_date>end_date||!reason)return res.status(400).json({error:"Enter room, valid date range and reason."});
 const x=await db.runAsync("INSERT INTO maintenance(room_id,start_date,end_date,reason) VALUES(?,?,?,?)",[room_id,start_date,end_date,reason]);
 const affected=await db.allAsync("SELECT * FROM bookings WHERE room_id=? AND booking_date BETWEEN ? AND ? AND status IN ('Confirmed','Pending')",[room_id,start_date,end_date]);
 for(const b of affected){await db.runAsync("UPDATE bookings SET status='Cancelled',qr_token=NULL WHERE id=?",[b.id]);await notify(b.user_id,"Booking affected by maintenance",`Booking #${b.id} was cancelled due to ${reason}. Please choose an alternative room.`,"maintenance");}
 res.status(201).json({maintenanceId:x.lastID,affectedBookings:affected.length,message:"Maintenance period saved; affected bookings cancelled and users notified in-app."});
}));
app.get("/api/maintenance",auth,roles("Admin","Faculty"),asyncRoute(async(req,res)=>res.json(await db.allAsync("SELECT m.*,r.room_name FROM maintenance m JOIN rooms r ON r.id=m.room_id ORDER BY start_date DESC"))));

app.post("/api/faculty/blocks",auth,roles("Faculty","Admin"),asyncRoute(async(req,res)=>{const {room_id,day_of_week,start_time,end_time,purpose}=req.body;if(start_time>=end_time)return res.status(400).json({error:"Invalid time range."});const x=await db.runAsync("INSERT INTO recurring_blocks(room_id,faculty_id,day_of_week,start_time,end_time,purpose) VALUES(?,?,?,?,?,?)",[room_id,req.user.id,day_of_week,start_time,end_time,purpose]);res.status(201).json({id:x.lastID,message:"Recurring schedule block created."});}));
app.get("/api/faculty/blocks",auth,roles("Faculty","Admin"),asyncRoute(async(req,res)=>res.json(await db.allAsync("SELECT rb.*,r.room_name,u.name faculty_name FROM recurring_blocks rb JOIN rooms r ON r.id=rb.room_id JOIN users u ON u.id=rb.faculty_id"))));

app.get("/api/approvals",auth,roles("Admin","Faculty"),asyncRoute(async(req,res)=>res.json(await db.allAsync("SELECT b.*,r.room_name,u.name,u.email FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN users u ON u.id=b.user_id WHERE b.status='Pending' ORDER BY b.created_at"))));
app.post("/api/approvals/:id",auth,roles("Admin","Faculty"),asyncRoute(async(req,res)=>{
 const {decision,comment=""}=req.body;if(!["Confirmed","Declined"].includes(decision))return res.status(400).json({error:"Decision must be Confirmed or Declined."});
 const b=await db.getAsync("SELECT * FROM bookings WHERE id=? AND status='Pending'",[req.params.id]);if(!b)return res.status(404).json({error:"Pending booking not found."});
 const qr=decision==="Confirmed"?require("crypto").randomBytes(24).toString("hex"):null;
 await db.runAsync("UPDATE bookings SET status=?,approval_comment=?,qr_token=? WHERE id=?",[decision,comment,qr,b.id]);await notify(b.user_id,"Booking decision",`Your booking #${b.id} was ${decision.toLowerCase()}. ${comment}`,"approval");res.json({message:`Booking ${decision.toLowerCase()}.`});
}));

app.get("/api/notifications",auth,asyncRoute(async(req,res)=>res.json(await db.allAsync("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",[req.user.id]))));
app.put("/api/notifications/:id/read",auth,asyncRoute(async(req,res)=>{await db.runAsync("UPDATE notifications SET read=1 WHERE id=? AND user_id=?",[req.params.id,req.user.id]);res.json({message:"Marked as read."});}));
app.put("/api/preferences",auth,asyncRoute(async(req,res)=>{const {notify_booking=1,notify_reminders=1,notify_waitlist=1}=req.body;await db.runAsync("UPDATE users SET notify_booking=?,notify_reminders=?,notify_waitlist=? WHERE id=?",[notify_booking?1:0,notify_reminders?1:0,notify_waitlist?1:0,req.user.id]);res.json({message:"Notification preferences saved."});}));

app.get("/api/reports/priority",auth,roles("Admin","Faculty"),asyncRoute(async(req,res)=>{
 const {from,to,type,department}=req.query;let sql="SELECT u.id,u.name,u.email,u.department,u.academic_need,u.prior_cancellations,u.waitlist_history,COUNT(b.id) bookings FROM users u LEFT JOIN bookings b ON b.user_id=u.id AND b.created_at IS NOT NULL WHERE u.role='Student'",p=[];
 if(from){sql+=" AND (b.booking_date IS NULL OR b.booking_date>=?)";p.push(from);}if(to){sql+=" AND (b.booking_date IS NULL OR b.booking_date<=?)";p.push(to);}if(department){sql+=" AND u.department=?";p.push(department);}
 sql+=" GROUP BY u.id";
 if(type){sql=sql.replace("WHERE u.role='Student'","WHERE u.role='Student' AND EXISTS (SELECT 1 FROM bookings bx JOIN rooms rx ON rx.id=bx.room_id WHERE bx.user_id=u.id AND rx.room_type=?)");p.unshift(type);}
 const rows=await db.allAsync(sql,p);
 const weight=async(k,d)=>Number((await db.getAsync("SELECT value FROM settings WHERE key=?",[k]))?.value||d);
 const [aw,cw,ww]=await Promise.all([weight("priority_academic_need_weight",5),weight("priority_cancellation_weight",2),weight("priority_waitlist_weight",1)]);
 for(const u of rows)u.priority_score=u.academic_need*aw-u.prior_cancellations*cw+u.waitlist_history*ww;
 rows.sort((a,b)=>b.priority_score-a.priority_score);res.json(rows);
}));
app.get("/api/reports/priority.csv",auth,roles("Admin","Faculty"),asyncRoute(async(req,res)=>{
 const rows=await db.allAsync("SELECT name,email,department,academic_need,prior_cancellations,waitlist_history FROM users WHERE role='Student'");
 const weight=async(k,d)=>Number((await db.getAsync("SELECT value FROM settings WHERE key=?",[k]))?.value||d);
 const [aw,cw,ww]=await Promise.all([weight("priority_academic_need_weight",5),weight("priority_cancellation_weight",2),weight("priority_waitlist_weight",1)]);
 const out=["Name,Email,Department,Academic Need,Cancellations,Waitlist History,Priority Score",...rows.map(u=>[u.name,u.email,u.department,u.academic_need,u.prior_cancellations,u.waitlist_history,u.academic_need*aw-u.prior_cancellations*cw+u.waitlist_history*ww].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");res.type("text/csv").attachment("SmartBook-Priority-Report.csv").send(out);
}));
app.get("/api/settings",auth,roles("Admin"),asyncRoute(async(req,res)=>res.json(await db.allAsync("SELECT * FROM settings"))));
app.put("/api/settings",auth,roles("Admin"),asyncRoute(async(req,res)=>{for(const [k,v] of Object.entries(req.body))await db.runAsync("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[k,String(v)]);res.json({message:"Settings saved."});}));
app.get("/api/dashboard",auth,asyncRoute(async(req,res)=>{
 const where=req.user.role==="Student"?"WHERE user_id=?":"";const p=req.user.role==="Student"?[req.user.id]:[];
 const [bookings,spaces,wait,pend,notifs]=await Promise.all([
 db.getAsync(`SELECT COUNT(*) n FROM bookings ${where}`,p),db.getAsync("SELECT COUNT(*) n FROM rooms WHERE active=1"),db.getAsync(`SELECT COUNT(*) n FROM waitlist ${req.user.role==="Student"?"WHERE user_id=? AND status IN ('Waiting','Offered')":"WHERE status IN ('Waiting','Offered')"}`,p),db.getAsync("SELECT COUNT(*) n FROM bookings WHERE status='Pending'"),db.getAsync("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0",[req.user.id])]);
 res.json({bookings:bookings.n,spaces:spaces.n,waitlist:wait.n,pendingApprovals:pend.n,unreadNotifications:notifs.n});
}));

// Scheduled jobs: expire unaccepted waitlist offers and send booking reminders into the in-app inbox.
cron.schedule("* * * * *",async()=>{
 try{
  const expired=await db.allAsync("SELECT * FROM waitlist WHERE status='Offered' AND offer_expires < ?",[new Date().toISOString()]);
  for(const w of expired){await db.runAsync("UPDATE waitlist SET status='Expired' WHERE id=?",[w.id]);await promoteWaitlist(w.room_id,w.booking_date,w.start_time,w.end_time);}
  const soon=new Date(Date.now()+15*60000),date=soon.toISOString().slice(0,10),time=soon.toTimeString().slice(0,5);
  const upcoming=await db.allAsync("SELECT * FROM bookings WHERE status='Confirmed' AND booking_date=? AND start_time BETWEEN ? AND ?",[date,time,new Date(Date.now()+16*60000).toTimeString().slice(0,5)]);
  for(const b of upcoming){const exists=await db.getAsync("SELECT id FROM notifications WHERE user_id=? AND title='Upcoming booking reminder' AND message LIKE ?",[b.user_id,`%#${b.id}%`]);if(!exists)await notify(b.user_id,"Upcoming booking reminder",`Your booking #${b.id} starts in about 15 minutes.`,"reminder");}
 }catch(e){console.error("Scheduled task:",e.message);}
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Server error. Check the terminal for details."});});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`SmartBook full SRS demo running: http://localhost:${PORT}`));
