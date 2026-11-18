const base="http://localhost:3000";
(async()=>{
 try{
  const h=await fetch(base+"/api/health");if(!h.ok)throw Error("Health check failed");
  const a=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@smartbook.demo",password:"Admin@123"})});
  const d=await a.json();if(!a.ok)throw Error("Admin login failed. Start server and check README demo account.");
  const headers={"Content-Type":"application/json",Authorization:"Bearer "+d.token};
  const rooms=await (await fetch(base+"/api/rooms")).json();if(!rooms.length)throw Error("No spaces seeded.");
  const bookings=await fetch(base+"/api/bookings",{headers});if(!bookings.ok)throw Error("Booking endpoint failed.");
  console.log("PASS: health, seeded spaces, admin login and protected booking API.");
  console.log("For the complete workflow, use the UI to register a student, book a room, approve, cancel, waitlist and check QR access.");
 }catch(e){console.error("TEST FAILED:",e.message);process.exitCode=1;}
})();