const API = "/api";
let token = localStorage.getItem("sb_token"), me = null, rooms = [], tab = "dashboard";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Theme Preference System (System, Light, Dark) */
const THEME_KEY = "sb_theme_preference";

function getStoredThemePreference() {
  return localStorage.getItem(THEME_KEY) || "system";
}

function resolveEffectiveTheme(pref) {
  if (pref === "system") {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref === "dark" ? "dark" : "light";
}

function applyTheme(pref) {
  const effective = resolveEffectiveTheme(pref);
  document.documentElement.setAttribute("data-theme", effective);
  document.documentElement.setAttribute("data-theme-preference", pref);
  localStorage.setItem(THEME_KEY, pref);
  syncThemeButtons();
}

function syncThemeButtons() {
  const currentPref = getStoredThemePreference();
  document.querySelectorAll(".theme-btn").forEach(btn => {
    const isActive = btn.dataset.themeVal === currentPref;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function themeSelectorHTML(id = "themeSelector", extraClass = "") {
  const pref = getStoredThemePreference();
  return `
    <div class="theme-selector ${extraClass}" id="${id}" role="group" aria-label="Theme preference">
      <button type="button" class="theme-btn ${pref === "system" ? "active" : ""}" data-theme-val="system" title="System (follows operating system theme)" aria-pressed="${pref === "system"}">
        <span class="theme-icon">💻</span>
        <span class="theme-label">System</span>
      </button>
      <button type="button" class="theme-btn ${pref === "light" ? "active" : ""}" data-theme-val="light" title="Pastel peach light theme" aria-pressed="${pref === "light"}">
        <span class="theme-icon">☀️</span>
        <span class="theme-label">Light</span>
      </button>
      <button type="button" class="theme-btn ${pref === "dark" ? "active" : ""}" data-theme-val="dark" title="Warm charcoal dark theme" aria-pressed="${pref === "dark"}">
        <span class="theme-icon">🌙</span>
        <span class="theme-label">Dark</span>
      </button>
    </div>
  `;
}

// Global delegated listener for theme buttons
document.addEventListener("click", e => {
  const btn = e.target.closest(".theme-btn");
  if (btn && btn.dataset.themeVal) {
    e.preventDefault();
    applyTheme(btn.dataset.themeVal);
  }
});

// React dynamically to OS theme changes if user preference is System
if (window.matchMedia) {
  const osMedia = window.matchMedia("(prefers-color-scheme: dark)");
  const handleOSChange = e => {
    if (getStoredThemePreference() === "system") {
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    }
  };
  if (osMedia.addEventListener) {
    osMedia.addEventListener("change", handleOSChange);
  } else if (osMedia.addListener) {
    osMedia.addListener(handleOSChange);
  }
}

// Initialize theme on load
applyTheme(getStoredThemePreference());

/* API and Core Helpers */
async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(opts.headers || {})
    }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || "Request failed");
  return d;
}

function notice(t) {
  const n = $("#notice");
  if (!n) { alert(t); return; }
  n.innerHTML = `<div class="notice">${esc(t)}</div>`;
  setTimeout(() => {
    const current = $("#notice");
    if (current) current.innerHTML = "";
  }, 5000);
}

function field(label, name, type = "text", value = "", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}

function select(label, name, options) {
  return `<label>${label}<select name="${name}">${options.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>`;
}

/* Authentication Screen (Login / Register) */
function authScreen() {
  $("#app").innerHTML = `
    <main class="auth">
      <div class="auth-theme-bar">
        ${themeSelectorHTML("authThemeSelector")}
      </div>
      <section class="auth-card">
        <div class="logo">S</div>
        <p class="kicker">SMARTBOOK CAMPUS PLATFORM</p>
        <h1>Welcome to <em>SmartBook</em></h1>
        <p class="muted">One place for campus rooms, equipment, schedules and collaborative spaces.</p>
        <div class="tabs">
          <button type="button" class="active" data-auth="login">Login</button>
          <button type="button" data-auth="register">Register</button>
        </div>
        <form id="authForm">
          <div id="authFields"></div>
          <button class="primary" type="submit">Continue →</button>
        </form>
      </section>
      <footer class="app-footer" style="border:none;margin-top:20px;padding:0;">
        <p>© 2026 <strong>SmartBook</strong> · Modern Campus Space Management</p>
      </footer>
    </main>
  `;

  function draw(mode) {
    document.querySelectorAll("[data-auth]").forEach(b => b.classList.toggle("active", b.dataset.auth === mode));
    $("#authFields").innerHTML = mode === "login"
      ? field("Email", "email", "email", "admin@smartbook.demo", "required") + field("Password", "password", "password", "Admin@123", "required")
      : field("Full name", "name", "text", "", "required") +
        field("Email", "email", "email", "", "required") +
        field("Password (min 6)", "password", "password", "", "required") +
        select("Role", "role", ["Student", "Faculty"]) +
        field("Department", "department", "text", "Computer Engineering");
  }

  draw("login");
  document.querySelectorAll("[data-auth]").forEach(b => b.onclick = () => draw(b.dataset.auth));

  $("#authForm").onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const mode = document.querySelector("[data-auth].active").dataset.auth;
      const d = await api("/auth/" + mode, { method: "POST", body: JSON.stringify(data) });
      token = d.token;
      localStorage.setItem("sb_token", token);
      me = d.user;
      await shell();
    } catch (err) {
      notice(err.message);
    }
  };

  syncThemeButtons();
}

/* Navigation Items per User Role */
function navItems() {
  const common = [
    ["dashboard", "Overview"],
    ["rooms", "Find Spaces"],
    ["bookings", "My Bookings"],
    ["recommend", "AI Slot Suggestions"],
    ["quick", "Quick Book"],
    ["waitlist", "Waitlist"],
    ["notifications", "Notifications"],
    ["preferences", "Preferences"]
  ];
  if (me.role === "Admin") {
    common.push(
      ["manage", "Manage Spaces"],
      ["equipment", "Equipment"],
      ["maintenance", "Maintenance"],
      ["approvals", "Approvals"],
      ["reports", "Priority Reports"],
      ["settings", "System Settings"]
    );
  }
  if (me.role === "Faculty") {
    common.push(
      ["faculty", "Faculty Coordination"],
      ["approvals", "Approvals"],
      ["reports", "Priority Reports"]
    );
  }
  return common;
}

/* Main Application Shell */
async function shell() {
  $("#app").innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#" onclick="event.preventDefault(); show('dashboard');">
        <span class="logo">S</span> SmartBook<span class="dot">.</span>
      </a>
      <p class="kicker">WORKSPACE</p>
      <nav id="nav"></nav>
      <div class="side-bottom">
        <div class="avatar">${esc(me.name[0].toUpperCase())}</div>
        <div>
          <b>${esc(me.name)}</b>
          <small>${esc(me.role)}</small>
        </div>
        <button id="logout" title="Logout">↗</button>
      </div>
    </aside>
    <main class="main">
      <header>
        <div>
          <p class="kicker">SMARTBOOK · SPACE MANAGEMENT</p>
          <h1 id="pageTitle">Overview</h1>
        </div>
        <div class="header-right">
          ${themeSelectorHTML("headerThemeSelector")}
          <div class="user-pill">${esc(me.email)}</div>
        </div>
      </header>
      <div id="notice"></div>
      <section id="content"></section>
      <footer class="app-footer">
        <p>© 2026 <strong>SmartBook</strong> · Modern Campus Space Management System</p>
      </footer>
    </main>
  `;

  $("#nav").innerHTML = navItems().map(([id, n]) => `<button data-tab="${id}">${n}</button>`).join("");
  $("#nav").querySelectorAll("button").forEach(b => b.onclick = () => show(b.dataset.tab));
  $("#logout").onclick = () => {
    localStorage.removeItem("sb_token");
    token = null;
    me = null;
    authScreen();
  };

  syncThemeButtons();
  await show("dashboard");
}

/* Page View Routing & Rendering */
async function show(t) {
  tab = t;
  $("#nav").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  $("#pageTitle").textContent = navItems().find(x => x[0] === t)?.[1] || t;
  const c = $("#content");
  c.innerHTML = '<p class="muted">Loading SmartBook spaces...</p>';

  try {
    if (t === "dashboard") {
      const d = await api("/dashboard");
      c.innerHTML = `
        <div class="hero">
          <div>
            <p class="kicker">YOUR CAMPUS, SIMPLIFIED</p>
            <h2>Find a space.<br><em>Focus on what matters.</em></h2>
            <p>Book rooms, coordinate schedules, manage equipment, and streamline campus resources with SmartBook.</p>
            <button class="primary" onclick="show('rooms')">Explore spaces →</button>
          </div>
          <div class="hero-art">SB<br><b>SMART<br>BOOK</b></div>
        </div>
        <div class="stats">
          ${stat("Bookings", d.bookings)}
          ${stat("Active spaces", d.spaces)}
          ${stat("Waitlist", d.waitlist)}
          ${stat("Pending approvals", d.pendingApprovals)}
        </div>
        <div class="panel">
          <h3>Quick access</h3>
          <div class="actions">
            <button onclick="show('rooms')">Find a room</button>
            <button onclick="show('recommend')">Get suggestions</button>
            <button onclick="show('bookings')">View bookings</button>
            <button onclick="show('notifications')">Notifications (${d.unreadNotifications})</button>
          </div>
        </div>
      `;
    }

    if (t === "rooms") {
      rooms = await api("/rooms");
      c.innerHTML = `
        <div class="panel">
          <h3>Search campus spaces</h3>
          <form id="search" class="formgrid">
            ${field("Date", "date", "date", new Date().toISOString().slice(0, 10), "required")}
            ${field("Start time", "start", "time", "10:00", "required")}
            ${field("End time", "end", "time", "11:00", "required")}
            ${select("Space type", "type", ["All", "Study Room", "Lab", "Classroom", "Amphitheatre", "Auditorium", "Seminar Room"])}
            ${field("Minimum capacity", "capacity", "number", "1", "min=1")}
            <button class="primary" type="submit">Check availability</button>
          </form>
        </div>
        <div id="roomList" class="cards">${roomCards(rooms)}</div>
      `;
      $("#search").onsubmit = async e => {
        e.preventDefault();
        const q = new URLSearchParams(Object.fromEntries(new FormData(e.target)));
        rooms = await api("/rooms?" + q);
        $("#roomList").innerHTML = roomCards(rooms);
        bindRoomButtons();
      };
      bindRoomButtons();
    }

    if (t === "bookings") {
      const b = await api("/bookings");
      c.innerHTML = `
        <div class="panel">
          <h3>Booking history</h3>
          <div class="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${b.length ? b.map(x => `
                  <tr>
                    <td><b>${esc(x.room_name)}</b></td>
                    <td>${esc(x.booking_date)}</td>
                    <td>${esc(x.start_time)}–${esc(x.end_time)}</td>
                    <td>${esc(x.purpose)}</td>
                    <td><span class="tag">${esc(x.status)}</span></td>
                    <td class="actions">
                      <button data-qr="${x.id}">QR pass</button>
                      ${["Confirmed", "Pending"].includes(x.status) ? `<button data-cancel="${x.id}">Cancel</button>` : ""}
                      ${x.status === "Cancelled" ? `<button data-delete="${x.id}" class="danger" title="Permanently delete cancelled booking">Delete</button>` : ""}
                    </td>
                  </tr>
                `).join("") : '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">No bookings found.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;
      c.querySelectorAll("[data-cancel]").forEach(btn => btn.onclick = async () => {
        if (confirm("Cancel this booking?")) {
          try {
            await api("/bookings/" + btn.dataset.cancel, { method: "DELETE" });
            notice("Booking cancelled.");
            show("bookings");
          } catch (err) {
            notice(err.message);
          }
        }
      });
      c.querySelectorAll("[data-delete]").forEach(btn => btn.onclick = async () => {
        if (confirm("Permanently delete this cancelled booking record? This cannot be undone.")) {
          try {
            const res = await api("/bookings/" + btn.dataset.delete + "?permanent=true", { method: "DELETE" });
            notice(res.message || "Cancelled booking permanently deleted.");
            show("bookings");
          } catch (err) {
            notice(err.message);
          }
        }
      });
      c.querySelectorAll("[data-qr]").forEach(btn => btn.onclick = async () => {
        try {
          const q = await api("/bookings/" + btn.dataset.qr + "/qr");
          modal("SmartBook Digital Access Pass", `
            <img class="qr" src="${q.qr}" alt="Digital Access QR Pass">
            <p style="text-align:center;margin-top:12px;font-size:12px;color:var(--text-secondary);">
              Valid window: <b>${esc(q.validFrom)}</b> – <b>${esc(q.validUntil)}</b>
            </p>
            ${q.status ? `<p style="text-align:center;margin-top:6px;"><span class="tag">${esc(q.status)}</span></p>` : ""}
          `);
        } catch (err) {
          notice(err.message);
        }
      });
    }

    if (t === "recommend") {
      const d = await api("/recommendations?date=" + new Date().toISOString().slice(0, 10) + "&start=10:00&end=11:00");
      c.innerHTML = `
        <div class="panel">
          <h3>Recommended spaces</h3>
          <p class="muted">Rule-based ranking using availability, group capacity fit and previous usage history.</p>
          <div class="cards">${roomCards(d)}</div>
        </div>
      `;
      bindRoomButtons();
    }

    if (t === "quick") {
      rooms = await api("/rooms");
      c.innerHTML = `
        <div class="panel narrow">
          <h3>Instant drop-in booking</h3>
          <p class="muted">Reserve a room that is free right now without prior planning.</p>
          <form id="quick">
            ${select("Choose room", "room_id", rooms.map(r => String(r.id) + " - " + r.room_name))}
            ${field("Duration (minutes)", "duration", "number", "60", "min=15 max=240")}
            ${field("Purpose", "purpose", "text", "Quick study session", "required")}
            <button class="primary" type="submit">Book now</button>
          </form>
        </div>
      `;
      $("#quick").onsubmit = async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        d.room_id = d.room_id.split(" - ")[0];
        try {
          const r = await api("/quick-book", { method: "POST", body: JSON.stringify(d) });
          notice(r.message);
          show("bookings");
        } catch (err) {
          notice(err.message);
        }
      };
    }

    if (t === "waitlist") {
      const w = await api("/waitlist");
      c.innerHTML = `
        <div class="panel">
          <h3>Waitlist and slot offers</h3>
          <p class="muted">Offers expire automatically based on the configured time window. When accepted, a confirmed booking is created.</p>
          ${w.length ? w.map(x => `
            <div class="listrow">
              <b>${esc(x.room_name)} · ${esc(x.booking_date)} ${esc(x.start_time)}–${esc(x.end_time)}</b>
              <span>${esc(x.status)} · Priority score: ${x.priority_score}</span>
              ${x.status === "Offered" ? `<button class="primary" data-accept="${x.id}">Accept offer</button><button data-decline="${x.id}">Decline</button>` : ""}
            </div>
          `).join("") : "<p class=\"muted\">No waitlist entries yet.</p>"}
        </div>
      `;
      c.querySelectorAll("[data-accept]").forEach(b => b.onclick = async () => {
        const r = await api(`/waitlist/${b.dataset.accept}/accept`, { method: "POST" });
        notice(r.message);
        show("bookings");
      });
      c.querySelectorAll("[data-decline]").forEach(b => b.onclick = async () => {
        await api(`/waitlist/${b.dataset.decline}/decline`, { method: "POST" });
        show("waitlist");
      });
    }

    if (t === "notifications") {
      const n = await api("/notifications");
      c.innerHTML = `
        <div class="panel">
          <h3>Notifications</h3>
          ${n.length ? n.map(x => `
            <div class="listrow">
              <b>${esc(x.title)}</b>
              <span>${esc(x.message)}</span>
              <small class="muted">${esc(x.created_at)}</small>
              ${!x.read ? `<button data-read="${x.id}">Mark read</button>` : ""}
            </div>
          `).join("") : "<p class=\"muted\">No notifications yet.</p>"}
        </div>
      `;
      c.querySelectorAll("[data-read]").forEach(b => b.onclick = async () => {
        await api("/notifications/" + b.dataset.read + "/read", { method: "PUT" });
        show("notifications");
      });
    }

    if (t === "preferences") {
      const pref = getStoredThemePreference();
      c.innerHTML = `
        <div class="panel narrow">
          <h3>Theme & Appearance</h3>
          <p class="muted">Choose your preferred visual theme for SmartBook. The application adapts instantly without page reload.</p>
          <div style="margin: 16px 0;">
            ${themeSelectorHTML("prefThemeSelector", "preference-theme-selector")}
          </div>
          <p class="hint">
            <strong>System:</strong> Automatically detects your OS theme.<br>
            <strong>Light:</strong> Warm off-white and soft pastel peach palette.<br>
            <strong>Dark:</strong> Deep warm charcoal and dark brown palette.
          </p>
        </div>
        <div class="panel narrow">
          <h3>Notification preferences</h3>
          <p class="muted">Control in-app alerts and scheduled reminders.</p>
          <form id="prefs">
            <label class="check"><input type="checkbox" name="notify_booking" checked> Booking status updates</label>
            <label class="check"><input type="checkbox" name="notify_reminders" checked> Upcoming booking reminders (15-min alerts)</label>
            <label class="check"><input type="checkbox" name="notify_waitlist" checked> Waitlist availability offers</label>
            <button class="primary" type="submit" style="margin-top:10px;">Save preferences</button>
          </form>
        </div>
      `;
      syncThemeButtons();
      $("#prefs").onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        await api("/preferences", {
          method: "PUT",
          body: JSON.stringify({
            notify_booking: f.notify_booking.checked,
            notify_reminders: f.notify_reminders.checked,
            notify_waitlist: f.notify_waitlist.checked
          })
        });
        notice("Notification preferences saved successfully.");
      };
    }

    if (t === "manage") {
      const r = await api("/rooms");
      c.innerHTML = `
        <div class="panel">
          <h3>Add campus space</h3>
          <form id="addroom" class="formgrid">
            ${field("Room name", "room_name", "text", "", "required")}
            ${select("Type", "room_type", ["Classroom", "Lab", "Amphitheatre", "Auditorium", "Study Room", "Seminar Room"])}
            ${field("Capacity", "capacity", "number", "30", "required min=1")}
            ${field("Location", "location", "text", "Main Campus", "required")}
            ${field("Facilities", "facilities", "text", "Projector, Whiteboard")}
            <label class="check"><input type="checkbox" name="requires_approval"> Requires approval</label>
            <button class="primary" type="submit">Add space</button>
          </form>
        </div>
        <div class="panel">
          <h3>Manage existing spaces</h3>
          ${r.map(x => `
            <div class="listrow">
              <b>${esc(x.room_name)} · ${esc(x.room_type)} · ${x.capacity} seats</b>
              <span>${esc(x.location)} · Status: ${esc(x.status)}</span>
              <button data-deactivate="${x.id}">Deactivate</button>
            </div>
          `).join("")}
        </div>
      `;
      $("#addroom").onsubmit = async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        d.requires_approval = e.target.requires_approval.checked;
        try {
          await api("/rooms", { method: "POST", body: JSON.stringify(d) });
          notice("Space added successfully.");
          show("manage");
        } catch (err) {
          notice(err.message);
        }
      };
      c.querySelectorAll("[data-deactivate]").forEach(b => b.onclick = async () => {
        if (confirm("Deactivate this campus space?")) {
          await api("/rooms/" + b.dataset.deactivate, { method: "DELETE" });
          notice("Space deactivated.");
          show("manage");
        }
      });
    }

    if (t === "equipment") {
      const e = await api("/equipment"), r = await api("/rooms");
      c.innerHTML = `
        <div class="panel">
          <h3>Add equipment</h3>
          <form id="addeq" class="formgrid">
            ${field("Equipment name", "name", "text", "", "required")}
            ${field("Category", "category", "text", "AV")}
            ${field("Quantity", "quantity", "number", "1", "min=1")}
            ${field("Linked room IDs (comma separated)", "room_ids", "text", r.map(x => x.id).join(","))}
            <button class="primary" type="submit">Add equipment</button>
          </form>
        </div>
        <div class="panel">
          <h3>Equipment inventory</h3>
          ${e.map(x => `
            <div class="listrow">
              <b>${esc(x.name)}</b>
              <span>Category: ${esc(x.category)} · Qty: ${x.quantity} · Status: ${esc(x.status)} · Linked rooms: ${esc(x.room_ids)}</span>
              <button data-eqdel="${x.id}">Remove</button>
            </div>
          `).join("")}
        </div>
      `;
      $("#addeq").onsubmit = async ev => {
        ev.preventDefault();
        await api("/equipment", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(ev.target))) });
        notice("Equipment added.");
        show("equipment");
      };
      c.querySelectorAll("[data-eqdel]").forEach(b => b.onclick = async () => {
        if (confirm("Remove this equipment item?")) {
          await api("/equipment/" + b.dataset.eqdel, { method: "DELETE" });
          show("equipment");
        }
      });
    }

    if (t === "maintenance") {
      const r = await api("/rooms"), m = await api("/maintenance");
      c.innerHTML = `
        <div class="panel">
          <h3>Schedule maintenance</h3>
          <form id="maint" class="formgrid">
            ${select("Room", "room_id", r.map(x => String(x.id) + " - " + x.room_name))}
            ${field("Start date", "start_date", "date", "", "required")}
            ${field("End date", "end_date", "date", "", "required")}
            ${field("Reason", "reason", "text", "Scheduled renovation", "required")}
            <button class="primary" type="submit">Mark unavailable</button>
          </form>
        </div>
        <div class="panel">
          <h3>Maintenance history</h3>
          ${m.length ? m.map(x => `
            <div class="listrow">
              <b>${esc(x.room_name)} · ${esc(x.start_date)} to ${esc(x.end_date)}</b>
              <span>Reason: ${esc(x.reason)} · Status: ${esc(x.status)}</span>
            </div>
          `).join("") : "<p class=\"muted\">No active maintenance records.</p>"}
        </div>
      `;
      $("#maint").onsubmit = async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        d.room_id = d.room_id.split(" - ")[0];
        const res = await api("/maintenance", { method: "POST", body: JSON.stringify(d) });
        notice(res.message);
        show("maintenance");
      };
    }

    if (t === "approvals") {
      const a = await api("/approvals");
      c.innerHTML = `
        <div class="panel">
          <h3>Pending booking requests</h3>
          <p class="muted">Review requests for spaces requiring administrative or faculty authorization.</p>
          ${a.length ? a.map(x => `
            <div class="listrow">
              <b>#${x.id} · ${esc(x.room_name)} · ${esc(x.name)}</b>
              <span>${esc(x.booking_date)} ${esc(x.start_time)}–${esc(x.end_time)} · ${esc(x.purpose)}</span>
              <input id="comment${x.id}" placeholder="Optional decision note" style="max-width:200px;">
              <button class="primary" data-decision="${x.id}" data-value="Confirmed">Approve</button>
              <button data-decision="${x.id}" data-value="Declined">Decline</button>
            </div>
          `).join("") : "<p class=\"muted\">No pending approvals at this time.</p>"}
        </div>
      `;
      c.querySelectorAll("[data-decision]").forEach(b => b.onclick = async () => {
        const id = b.dataset.decision;
        await api("/approvals/" + id, {
          method: "POST",
          body: JSON.stringify({ decision: b.dataset.value, comment: $("#comment" + id)?.value || "" })
        });
        show("approvals");
      });
    }

    if (t === "faculty") {
      const r = await api("/rooms"), b = await api("/faculty/blocks");
      c.innerHTML = `
        <div class="panel">
          <h3>Recurring lecture / lab block</h3>
          <form id="block" class="formgrid">
            ${select("Room", "room_id", r.map(x => String(x.id) + " - " + x.room_name))}
            ${select("Day", "day_of_week", ["0 - Sun", "1 - Mon", "2 - Tue", "3 - Wed", "4 - Thu", "5 - Fri", "6 - Sat"])}
            ${field("Start", "start_time", "time", "09:00", "required")}
            ${field("End", "end_time", "time", "10:00", "required")}
            ${field("Purpose", "purpose", "text", "Lecture", "required")}
            <button class="primary" type="submit">Create recurring block</button>
          </form>
        </div>
        <div class="panel">
          <h3>Current faculty blocks</h3>
          ${b.length ? b.map(x => `
            <div class="listrow">
              <b>${esc(x.room_name)} · ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][x.day_of_week]}</b>
              <span>${esc(x.start_time)}–${esc(x.end_time)} · ${esc(x.purpose)} (Instructor: ${esc(x.faculty_name)})</span>
            </div>
          `).join("") : "<p class=\"muted\">No recurring blocks created yet.</p>"}
        </div>
      `;
      $("#block").onsubmit = async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        d.room_id = d.room_id.split(" - ")[0];
        d.day_of_week = d.day_of_week.split(" - ")[0];
        await api("/faculty/blocks", { method: "POST", body: JSON.stringify(d) });
        notice("Recurring block created.");
        show("faculty");
      };
    }

    if (t === "reports") {
      const r = await api("/reports/priority");
      c.innerHTML = `
        <div class="panel">
          <div class="between" style="margin-bottom:12px;">
            <h3>Priority student report</h3>
            <a class="button" href="/api/reports/priority.csv" onclick="event.preventDefault(); downloadReport();">Export CSV</a>
          </div>
          <p class="muted">Score = academic need × 5 − prior cancellations × 2 + waitlist history.</p>
          <div class="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student</th>
                  <th>Department</th>
                  <th>Bookings</th>
                  <th>Priority score</th>
                </tr>
              </thead>
              <tbody>
                ${r.map((x, i) => `
                  <tr>
                    <td><b>${i + 1}</b></td>
                    <td>${esc(x.name)}</td>
                    <td>${esc(x.department)}</td>
                    <td>${x.bookings}</td>
                    <td><b>${x.priority_score}</b></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    if (t === "settings") {
      const s = await api("/settings");
      c.innerHTML = `
        <div class="panel narrow">
          <h3>Theme Preference</h3>
          <p class="muted">Select application theme preference for this device.</p>
          <div style="margin: 14px 0;">
            ${themeSelectorHTML("settingsThemeSelector", "preference-theme-selector")}
          </div>
        </div>
        <div class="panel narrow">
          <h3>System configuration</h3>
          <form id="settings">
            ${s.map(x => field(x.key.replaceAll("_", " "), x.key, "number", x.value)).join("")}
            <button class="primary" type="submit" style="margin-top:10px;">Save configuration</button>
          </form>
        </div>
      `;
      syncThemeButtons();
      $("#settings").onsubmit = async e => {
        e.preventDefault();
        await api("/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
        notice("Settings updated successfully.");
      };
    }
  } catch (e) {
    c.innerHTML = `<div class="panel error">${esc(e.message)}</div>`;
  }
}

/* UI Helper Functions */
function stat(a, b) {
  return `<div class="stat"><small>${a}</small><strong>${b}</strong></div>`;
}

function roomCards(rs) {
  return rs.map(r => `
    <article class="roomcard">
      <div class="roomtop">
        <span>${esc(r.room_type)}</span>
        <span class="tag">${r.available === false ? "Busy" : (r.status || "Available")}</span>
      </div>
      <h3>${esc(r.room_name)}</h3>
      <p>${esc(r.location)} · ${r.capacity} seats</p>
      <small>${esc(r.facilities || "Standard facilities")}</small>
      <div class="roomfoot">
        <span>${r.score ? "Match score: " + Math.round(r.score) : "Campus space"}</span>
        <button class="primary" data-book="${r.id}" ${r.available === false ? "disabled" : ""}>Book room →</button>
      </div>
    </article>
  `).join("") || "<p class=\"muted\">No matching spaces found.</p>";
}

function bindRoomButtons() {
  document.querySelectorAll("[data-book]").forEach(b => b.onclick = () => bookingModal(Number(b.dataset.book)));
}

async function bookingModal(id) {
  const r = await api("/rooms");
  const room = r.find(x => x.id === id);
  if (!room) return;

  modal("Reserve " + room.room_name, `
    <form id="bookingForm" class="modalform">
      ${field("Booking date", "booking_date", "date", new Date().toISOString().slice(0, 10), "required")}
      ${field("Start time", "start_time", "time", "10:00", "required")}
      ${field("End time", "end_time", "time", "11:00", "required")}
      ${field("Purpose", "purpose", "text", "Study / project meeting", "required")}
      ${field("Group size", "group_size", "number", "1", "min=1 max=" + room.capacity)}
      ${field("Group members (comma separated)", "group_members", "text", "")}
      ${field("Equipment IDs (comma separated)", "equipment_ids", "text", "")}
      <button class="primary" type="submit">Submit booking</button>
      <button type="button" id="joinWait">Join waitlist instead</button>
    </form>
  `);

  $("#bookingForm").onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.room_id = id;
    d.equipment_ids = d.equipment_ids ? d.equipment_ids.split(",").map(Number).filter(Boolean) : [];
    try {
      const x = await api("/bookings", { method: "POST", body: JSON.stringify(d) });
      closeModal();
      notice(x.message);
      show("bookings");
    } catch (err) {
      notice(err.message);
    }
  };

  $("#joinWait").onclick = async () => {
    const d = Object.fromEntries(new FormData($("#bookingForm")));
    d.room_id = id;
    try {
      const x = await api("/waitlist", { method: "POST", body: JSON.stringify(d) });
      closeModal();
      notice(x.message + " Position in queue: " + x.position);
      show("waitlist");
    } catch (err) {
      notice(err.message);
    }
  };
}

function modal(title, body) {
  let m = document.createElement("div");
  m.id = "modal";
  m.className = "modal";
  m.innerHTML = `
    <div class="modalbox">
      <button class="close" onclick="closeModal()" title="Close dialog">×</button>
      <h2>${title}</h2>
      ${body}
    </div>
  `;
  document.body.appendChild(m);
}

function closeModal() {
  document.querySelector("#modal")?.remove();
}

function downloadReport() {
  fetch(API + "/reports/priority.csv", { headers: { Authorization: "Bearer " + token } })
    .then(r => r.blob())
    .then(b => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "SmartBook-Priority-Report.csv";
      a.click();
    })
    .catch(err => notice("Failed to download CSV: " + err.message));
}

/* App Initialization */
(async () => {
  if (!token) {
    authScreen();
    return;
  }
  try {
    me = await api("/auth/me");
    await shell();
  } catch {
    localStorage.removeItem("sb_token");
    token = null;
    authScreen();
  }
})();
