// =========================================================================
// --- STANDALONE PARISH HOURS TRACKER ENGINE ---
// =========================================================================

const INITIAL_HOURS_LOGS = [
    {
        id: "mock-hours-1",
        date: "2026-05-25",
        startTime: "09:00",
        endTime: "13:00",
        hours: 4.0,
        notes: "Updated Sunday bulletins, prepared weekly parish announcements, sent out e-news newsletter, organized vestry correspondence.",
        source: "manual"
    },
    {
        id: "mock-hours-2",
        date: "2026-05-26",
        startTime: "08:30",
        endTime: "12:30",
        hours: 4.0,
        notes: "Prepared readings for Tuesday Morning Daily Office, cataloged food pantry kitchen inventory, coordinated Sunday altar flowers order.",
        source: "clock"
    },
    {
        id: "mock-hours-3",
        date: "2026-05-27",
        startTime: "09:00",
        endTime: "14:00",
        hours: 5.0,
        notes: "Uploaded Weekly Sermon Podcast episodes to PodPoint, updated Sunday lay minister signups on parish rota board.",
        source: "clock"
    }
];

let state = {
    hoursLogs: [],
    activeSession: null
};

let hoursTimerInterval = null;
let fallbackAuth = false;

const AUTH_PASSWORD = "W2rd0fG0dHTEC08090!";

// Simple XOR & Base64 client-side encryption helper
function encryptPayload(text, key) {
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const keyCode = key.charCodeAt(i % key.length);
        result += String.fromCharCode(charCode ^ keyCode);
    }
    return btoa(unescape(encodeURIComponent(result)));
}

// Simple XOR & Base64 client-side decryption helper
function decryptPayload(ciphertext, key) {
    const raw = decodeURIComponent(escape(atob(ciphertext)));
    let result = "";
    for (let i = 0; i < raw.length; i++) {
        const charCode = raw.charCodeAt(i);
        const keyCode = key.charCodeAt(i % key.length);
        result += String.fromCharCode(charCode ^ keyCode);
    }
    return result;
}

// Authentication gate checker
function checkAuthenticationState() {
    let authState = false;
    try {
        authState = sessionStorage.getItem("htec_timesheet_auth") === "true";
    } catch (e) {
        authState = fallbackAuth;
    }
    
    const loginScreen = document.getElementById("login-screen");
    const appContent = document.getElementById("app-content");
    
    if (authState) {
        if (loginScreen) loginScreen.style.display = "none";
        if (appContent) appContent.style.display = "block";
    } else {
        if (loginScreen) loginScreen.style.display = "flex";
        if (appContent) appContent.style.display = "none";
    }
}

// Authentication login submission handler
window.handleLoginSubmit = function(event) {
    if (event) event.preventDefault();
    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");
    const errorMsg = document.getElementById("login-error");
    
    if (!usernameInput || !passwordInput) return false;
    
    const user = usernameInput.value.trim();
    const pass = passwordInput.value;
    
    if (user === "admin" && pass === AUTH_PASSWORD) {
        try {
            sessionStorage.setItem("htec_timesheet_auth", "true");
        } catch (e) {
            console.warn("sessionStorage not accessible; falling back to in-memory auth.");
        }
        fallbackAuth = true;
        if (errorMsg) errorMsg.style.display = "none";
        usernameInput.value = "";
        passwordInput.value = "";
        checkAuthenticationState();
        
        // Auto pull cloud state upon successful login
        loadStateCloud();
        
        return true;
    } else {
        if (errorMsg) errorMsg.style.display = "block";
        return false;
    }
};

// Logout handler
window.handleLogout = function() {
    if (confirm("Are you sure you want to log out?")) {
        try {
            sessionStorage.removeItem("htec_timesheet_auth");
        } catch (e) {}
        fallbackAuth = false;
        checkAuthenticationState();
    }
};

// Save to cloud with secure client-side encryption
window.saveStateCloud = async function() {
    const saveBtn = document.getElementById("save-progress-btn");
    const originalText = saveBtn ? saveBtn.textContent : "Save Progress";
    if (saveBtn) {
        saveBtn.textContent = "Saving...";
        saveBtn.disabled = true;
    }
    
    // Save locally first
    saveState();
    
    try {
        const encryptedData = encryptPayload(JSON.stringify(state.hoursLogs), AUTH_PASSWORD);
        
        const response = await fetch("https://kvdb.io/5jGXNWai7sdTCFHwEEt5dE/htec_timesheet_logs", {
            method: "POST",
            headers: {
                "Content-Type": "text/plain"
            },
            body: encryptedData
        });
        
        if (!response.ok) {
            throw new Error("Cloud synchronization failed");
        }
        
        alert("Progress saved securely and synchronized successfully across all access devices.");
    } catch (e) {
        console.error("Cloud save failed, saved locally only.", e);
        alert("Changes saved locally. (Cloud sync offline; check internet connection)");
    } finally {
        if (saveBtn) {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }
};

// Load from cloud with decryption fallback
async function loadStateCloud() {
    try {
        const response = await fetch("https://kvdb.io/5jGXNWai7sdTCFHwEEt5dE/htec_timesheet_logs");
        if (response.ok) {
            const encryptedText = await response.text();
            if (encryptedText && encryptedText.trim().length > 0) {
                const decryptedData = decryptPayload(encryptedText.trim(), AUTH_PASSWORD);
                const parsedLogs = JSON.parse(decryptedData);
                if (Array.isArray(parsedLogs)) {
                    state.hoursLogs = parsedLogs;
                    saveState();
                    renderAll();
                    console.log("State synchronized from cloud successfully.");
                }
            }
        }
    } catch (e) {
        console.warn("Could not load from cloud, using local storage instead.", e);
    }
}

// Initialize Application
let calendarDate = new Date();

document.addEventListener("DOMContentLoaded", () => {
    checkAuthenticationState();
    loadState();
    startLiveSystemClock();
    checkActiveSession();
    renderAll();
    
    // Pull cloud logs on page load if already logged in
    let authState = false;
    try {
        authState = sessionStorage.getItem("htec_timesheet_auth") === "true";
    } catch (e) {
        authState = fallbackAuth;
    }
    if (authState) {
        loadStateCloud();
    }
});



// Load persistent data
function loadState() {
    const savedLogs = localStorage.getItem("standalone_hours_logs");
    const savedSession = localStorage.getItem("standalone_hours_active_session");
    
    state.hoursLogs = savedLogs ? JSON.parse(savedLogs) : [...INITIAL_HOURS_LOGS];
    state.activeSession = savedSession ? JSON.parse(savedSession) : null;
}

// Save persistent data
function saveState() {
    localStorage.setItem("standalone_hours_logs", JSON.stringify(state.hoursLogs));
    localStorage.setItem("standalone_hours_active_session", state.activeSession ? JSON.stringify(state.activeSession) : "");
}

// Live ticking header clock
function startLiveSystemClock() {
    const timeDisplay = document.getElementById("live-time-display");
    if (!timeDisplay) return;
    
    const updateClock = () => {
        const now = new Date();
        const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        const prettyDate = now.toLocaleDateString('en-US', options);
        const prettyTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        timeDisplay.textContent = `${prettyDate} — ${prettyTime}`;
    };
    
    updateClock();
    setInterval(updateClock, 30000); // update every 30 seconds
}

// Restart timer if active session was saved in local storage
function checkActiveSession() {
    if (state.activeSession) {
        startTimerTickerLoop();
    }
}

// Formats millisecond offsets to duration string
function formatDuration(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

// Active ticking clock looping
function startTimerTickerLoop() {
    const timerLabel = document.getElementById("clock-timer");
    const sessionDetails = document.getElementById("clock-session-details");
    
    if (hoursTimerInterval) clearInterval(hoursTimerInterval);
    
    hoursTimerInterval = setInterval(() => {
        if (!state.activeSession) {
            clearInterval(hoursTimerInterval);
            return;
        }
        
        const elapsedMs = new Date() - new Date(state.activeSession.startTime);
        if (timerLabel) {
            timerLabel.textContent = formatDuration(elapsedMs);
        }
        
        if (sessionDetails) {
            const startPretty = new Date(state.activeSession.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            sessionDetails.textContent = `Active Session since ${startPretty}`;
        }
    }, 1000);
}

// Renders the entire dashboard state
function renderAll() {
    renderClockConsole();
    calculateVisualMetrics();
    renderTimesheetCalendar();
    renderTimesheetTable();
}

// Updates Clock Console visual viewport
function renderClockConsole() {
    const statusDisplay = document.getElementById("clock-status-display");
    const statusText = document.getElementById("clock-status-text");
    const actionBtn = document.getElementById("clock-action-btn");
    const notesDrawer = document.getElementById("clock-notes-group");
    const timerLabel = document.getElementById("clock-timer");
    const sessionDetails = document.getElementById("clock-session-details");
    
    if (!actionBtn) return;
    
    if (state.activeSession) {
        // Clocked In State
        if (statusDisplay) statusDisplay.classList.add("clocked-in");
        if (statusText) statusText.textContent = "Clocked In";
        if (actionBtn) {
            actionBtn.textContent = "Clock Out Session";
            actionBtn.classList.add("clocked-in");
        }
        if (notesDrawer) notesDrawer.style.display = "block";
    } else {
        // Clocked Out State
        if (statusDisplay) statusDisplay.classList.remove("clocked-in");
        if (statusText) statusText.textContent = "Clocked Out";
        if (actionBtn) {
            actionBtn.textContent = "Start Active Session";
            actionBtn.classList.remove("clocked-in");
        }
        if (notesDrawer) notesDrawer.style.display = "none";
        if (timerLabel) timerLabel.textContent = "00:00:00";
        if (sessionDetails) sessionDetails.textContent = "No active session currently running";
    }
}

// SVG Gauge circle and analytical math
function calculateVisualMetrics() {
    const weeklyDisplay = document.getElementById("weekly-hours-display");
    const monthlyDisplay = document.getElementById("monthly-hours-display");
    const gaugeCircle = document.getElementById("weekly-gauge-circle");
    const gaugePercent = document.getElementById("weekly-gauge-percent");
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Start of week calculations (Monday)
    const dayOfWeek = today.getDay();
    const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(today.setDate(diffToMonday));
    startOfWeek.setHours(0,0,0,0);
    
    let weeklyTotal = 0;
    let monthlyTotal = 0;
    
    state.hoursLogs.forEach(log => {
        const logDate = new Date(`${log.date}T00:00:00`);
        
        if (logDate >= startOfWeek) {
            weeklyTotal += log.hours;
        }
        
        if (logDate.getFullYear() === currentYear && logDate.getMonth() === currentMonth) {
            monthlyTotal += log.hours;
        }
    });
    
    // Standard target weekly budget: 10.0h
    const targetWeekly = 10.0;
    const progressPercent = Math.min(100, Math.round((weeklyTotal / targetWeekly) * 100));
    
    // Update SVG Circle Ring (Circumference: 2 * PI * r = 2 * 3.14159 * 66 = 415)
    if (gaugeCircle) {
        const circumference = 415;
        const offset = circumference - (progressPercent / 100) * circumference;
        gaugeCircle.style.strokeDashoffset = offset;
    }
    
    if (gaugePercent) gaugePercent.textContent = `${progressPercent}%`;
    if (weeklyDisplay) weeklyDisplay.textContent = `${weeklyTotal.toFixed(1)}h`;
    if (monthlyDisplay) monthlyDisplay.textContent = `${monthlyTotal.toFixed(1)} hrs`;
}

// Clock session toggle trigger
window.toggleClockSession = function() {
    if (!state.activeSession) {
        // Start Session
        state.activeSession = {
            startTime: new Date().toISOString(),
            date: new Date().toISOString().split('T')[0]
        };
        saveState();
        startTimerTickerLoop();
        renderAll();
        alert("Session started. Tracker is actively running.");
    } else {
        // End Session
        const notesInput = document.getElementById("clock-notes-input");
        const notesVal = notesInput ? notesInput.value.trim() : "";
        
        const startTime = new Date(state.activeSession.startTime);
        const endTime = new Date();
        
        const durationHours = (endTime - startTime) / (1000 * 60 * 60);
        
        // Safety discard check if under 15 seconds
        if (durationHours < 0.004) {
            if (!confirm("This session was under 15 seconds. Discard session and abort log?")) {
                return;
            }
            state.activeSession = null;
            if (notesInput) notesInput.value = "";
            if (hoursTimerInterval) clearInterval(hoursTimerInterval);
            saveState();
            renderAll();
            return;
        }
        
        const formattedStart = startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
        const formattedEnd = endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
        
        const newLog = {
            id: "hours-" + Date.now(),
            date: state.activeSession.date,
            startTime: formattedStart,
            endTime: formattedEnd,
            hours: parseFloat(durationHours.toFixed(2)),
            notes: notesVal || "Parish administrative office support.",
            source: "clock"
        };
        
        state.hoursLogs.unshift(newLog);
        state.activeSession = null;
        if (notesInput) notesInput.value = "";
        
        if (hoursTimerInterval) clearInterval(hoursTimerInterval);
        
        saveState();
        renderAll();
        alert(`Clocked out. Logged ${durationHours.toFixed(2)} hours to your registry.`);
    }
};

// Retroactive Manual hours submit
window.addManualHoursLog = function(event) {
    event.preventDefault();
    
    const date = document.getElementById("manual-date").value;
    const start = document.getElementById("manual-start").value;
    const end = document.getElementById("manual-end").value;
    const notes = document.getElementById("manual-notes").value.trim();
    
    if (!date || !start || !end || !notes) return;
    
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    
    let durationHours = (eh - sh) + (em - sm) / 60;
    if (durationHours < 0) {
        durationHours += 24; // overnight shift check
    }
    
    const newLog = {
        id: "hours-" + Date.now(),
        date: date,
        startTime: start,
        endTime: end,
        hours: parseFloat(durationHours.toFixed(2)),
        notes: notes,
        source: "manual"
    };
    
    state.hoursLogs.unshift(newLog);
    saveState();
    
    document.getElementById("manual-hours-form").reset();
    renderAll();
    alert("Retroactive hours logged successfully.");
};

// Adjust Calendar Period Month
window.adjustCalendarPeriod = function(direction) {
    calendarDate.setMonth(calendarDate.getMonth() + direction);
    renderAll();
};

// Render Timesheet Calendar Grid
window.renderTimesheetCalendar = function() {
    const monthLabel = document.getElementById("calendar-month-label");
    const daysGrid = document.getElementById("calendar-days-grid");
    const detailsContainer = document.getElementById("calendar-day-details");
    const searchQuery = document.getElementById("timesheet-search") ? document.getElementById("timesheet-search").value.toLowerCase() : "";
    
    if (!daysGrid || !monthLabel) return;
    
    // Clear details drawer
    if (detailsContainer) {
        detailsContainer.style.display = "none";
        detailsContainer.innerHTML = "";
    }
    
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    // Update Month Label (e.g. May 2026)
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthLabel.textContent = `${monthNames[month]} ${year}`;
    
    daysGrid.innerHTML = "";
    
    // Get first day of month (0 = Sun, 1 = Mon...)
    const firstDayIndex = new Date(year, month, 1).getDay();
    
    // Get number of days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // Get total days in previous month for padding cells
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    // 1. Generate padding cells from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayNum = prevMonthDays - i;
        const cell = document.createElement("div");
        cell.className = "calendar-day-cell other-month";
        cell.innerHTML = `<span class="calendar-day-number">${dayNum}</span>`;
        daysGrid.appendChild(cell);
    }
    
    // 2. Generate active month cells
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    for (let day = 1; day <= totalDays; day++) {
        const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Find all logs matching this date
        const dayLogs = state.hoursLogs.filter(log => log.date === currentDayStr);
        const dayHours = dayLogs.reduce((sum, log) => sum + log.hours, 0);
        
        const cell = document.createElement("div");
        cell.className = "calendar-day-cell";
        if (currentDayStr === todayStr) {
            cell.classList.add("today");
        }
        
        // Build inner HTML content
        let contentHtml = `<span class="calendar-day-number">${day}</span>`;
        
        if (dayHours > 0) {
            contentHtml += `<span class="calendar-hours-badge">${dayHours.toFixed(1)}h</span>`;
            
            // Build notes snippets
            const notesText = dayLogs.map(log => log.notes).join("; ");
            contentHtml += `<div class="calendar-notes-snippet" title="${notesText}">${notesText}</div>`;
        }
        
        cell.innerHTML = contentHtml;
        
        // Apply search query highlighting/fading
        if (searchQuery) {
            const matchesSearch = dayLogs.some(log => log.notes.toLowerCase().includes(searchQuery));
            if (dayLogs.length > 0 && !matchesSearch) {
                cell.style.opacity = "0.2";
            } else if (matchesSearch) {
                cell.style.border = "2px solid var(--accent-green)";
                cell.style.background = "rgba(30, 70, 32, 0.04)";
            }
        }
        
        // Add click actions
        cell.onclick = () => handleCalendarDayClick(currentDayStr, dayLogs);
        
        daysGrid.appendChild(cell);
    }
    
    // 3. Generate padding cells for next month to complete the row grid
    const totalCellsFilled = firstDayIndex + totalDays;
    const remainingCells = (7 - (totalCellsFilled % 7)) % 7;
    
    for (let i = 1; i <= remainingCells; i++) {
        const cell = document.createElement("div");
        cell.className = "calendar-day-cell other-month";
        cell.innerHTML = `<span class="calendar-day-number">${i}</span>`;
        daysGrid.appendChild(cell);
    }
};

// Handle Calendar cell clicks
function handleCalendarDayClick(dateStr, logs) {
    const detailsContainer = document.getElementById("calendar-day-details");
    if (!detailsContainer) return;
    
    const parsedDate = new Date(`${dateStr}T00:00:00`);
    const dateOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    const prettyDate = parsedDate.toLocaleDateString('en-US', dateOptions);
    
    if (logs.length === 0) {
        // Empty day -> auto-populate the retroactive form and smooth scroll to it
        detailsContainer.style.display = "none";
        
        const manualDateInput = document.getElementById("manual-date");
        if (manualDateInput) {
            manualDateInput.value = dateStr;
            manualDateInput.focus();
            manualDateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add a brief golden highlight flash effect
            manualDateInput.style.transition = "all 0.3s";
            manualDateInput.style.borderColor = "var(--accent-gold)";
            manualDateInput.style.boxShadow = "0 0 15px var(--accent-gold)";
            setTimeout(() => {
                manualDateInput.style.borderColor = "var(--border-color)";
                manualDateInput.style.boxShadow = "none";
            }, 1000);
        }
        return;
    }
    
    // Build detail view HTML for days with logged hours
    let logsHtml = "";
    logs.forEach(log => {
        logsHtml += `
            <div style="background:var(--bg-base); padding:0.85rem; border-radius:var(--radius-md); border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-top:0.75rem;">
                <div style="flex:1; min-width:240px;">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
                        <span style="font-weight:700; color:var(--accent-gold); font-size:0.9rem;">${log.startTime} – ${log.endTime}</span>
                        <span style="font-weight:800; font-family:var(--font-alt); font-size:0.75rem; color:#1e4620; background:rgba(30, 70, 32, 0.06); padding:0.1rem 0.35rem; border-radius:4px;">${log.hours.toFixed(2)} hrs</span>
                        <span style="font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">${log.source}</span>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text-main); line-height:1.45; margin:0;">${log.notes}</p>
                </div>
                <div style="display:flex; gap:0.35rem;">
                    <button class="slot-sub-btn" onclick="editHoursLog('${log.id}')" style="padding:0.3rem 0.6rem; font-size:0.75rem;">Edit</button>
                    <button class="slot-sub-btn sub-flagged" onclick="deleteHoursLog('${log.id}')" style="padding:0.3rem 0.6rem; font-size:0.75rem;">Delete</button>
                </div>
            </div>
        `;
    });
    
    detailsContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; margin-bottom:0.5rem;">
            <h4 style="font-family:var(--font-heading); font-size:1.1rem; color:var(--text-main); margin:0;">Logged Sessions for ${prettyDate}</h4>
            <button class="slot-sub-btn" onclick="document.getElementById('calendar-day-details').style.display='none'" style="padding:0.2rem 0.5rem; font-size:0.7rem;">Close</button>
        </div>
        ${logsHtml}
    `;
    
    detailsContainer.style.display = "block";
    detailsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Populate Registry Table Grid
window.renderTimesheetTable = function() {
    const tableBody = document.getElementById("timesheet-table-body");
    const filterVal = document.getElementById("timesheet-filter") ? document.getElementById("timesheet-filter").value : "all";
    const searchVal = document.getElementById("timesheet-search") ? document.getElementById("timesheet-search").value.toLowerCase() : "";
    
    if (!tableBody) return;
    
    tableBody.innerHTML = "";
    
    let filteredLogs = [...state.hoursLogs];
    
    // Filter by text search
    if (searchVal) {
        filteredLogs = filteredLogs.filter(log => log.notes.toLowerCase().includes(searchVal));
    }
    
    // Filter by time period
    if (filterVal === "week") {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const startOfWeek = new Date(today.setDate(diffToMonday));
        startOfWeek.setHours(0,0,0,0);
        
        filteredLogs = filteredLogs.filter(log => new Date(`${log.date}T00:00:00`) >= startOfWeek);
    } else if (filterVal === "month") {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        
        filteredLogs = filteredLogs.filter(log => {
            const d = new Date(`${log.date}T00:00:00`);
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        });
    }
    
    if (filteredLogs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-style:italic;">No historical registry logs found matching selected filters.</td></tr>`;
        return;
    }
    
    filteredLogs.forEach(log => {
        const tr = document.createElement("tr");
        
        const parsedDate = new Date(`${log.date}T00:00:00`);
        const dateOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        const prettyDate = parsedDate.toLocaleDateString('en-US', dateOptions);
        
        const isClock = log.source === "clock";
        const methodBadge = isClock 
            ? `<span class="method-tag clock">Clock</span>`
            : `<span class="method-tag manual">Manual</span>`;
            
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--text-main);">${prettyDate}</td>
            <td style="font-family:monospace; color:var(--text-muted);">${log.startTime} - ${log.endTime}</td>
            <td style="font-weight:700; text-align:center; color:var(--accent-gold);">${log.hours.toFixed(2)}h</td>
            <td style="line-height:1.45; color:var(--text-muted); max-width: 400px; word-wrap: break-word;">${log.notes}</td>
            <td style="text-align:center;">${methodBadge}</td>
            <td style="text-align:center;">
                <div style="display:flex; justify-content:center; gap:0.35rem;">
                    <button class="slot-sub-btn" onclick="editHoursLog('${log.id}')">Edit</button>
                    <button class="slot-sub-btn sub-flagged" onclick="deleteHoursLog('${log.id}')">Delete</button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// Edit timesheet log inline
window.editHoursLog = function(logId) {
    const log = state.hoursLogs.find(l => l.id === logId);
    if (!log) return;
    
    const newNotes = prompt(`Modify Completed Tasks Details:`, log.notes);
    if (newNotes === null) return;
    
    const newHoursStr = prompt(`Modify Total Logged Hours (currently: ${log.hours} hrs):`, log.hours);
    if (newHoursStr === null) return;
    
    const newHours = parseFloat(newHoursStr);
    if (isNaN(newHours) || newHours <= 0) {
        alert("Invalid input! Please specify a positive numeric value.");
        return;
    }
    
    log.notes = newNotes.trim() || "Parish administrative office support.";
    log.hours = parseFloat(newHours.toFixed(2));
    
    saveState();
    renderAll();
    alert("Entry modified successfully.");
};

// Delete log entry
window.deleteHoursLog = function(logId) {
    const log = state.hoursLogs.find(l => l.id === logId);
    if (!log) return;
    
    if (confirm(`Remove timesheet entry permanently for ${log.date} (${log.hours}h)?`)) {
        state.hoursLogs = state.hoursLogs.filter(l => l.id !== logId);
        saveState();
        renderAll();
        alert("Log entry removed.");
    }
};

// CSV Timesheet file compilers
window.exportTimesheetCSV = function() {
    if (state.hoursLogs.length === 0) {
        alert("No logs available in database registry to export!");
        return;
    }
    
    const headers = ["Date", "Start Time", "End Time", "Total Worked Hours", "Tasks Completed", "Log Method"];
    const rows = state.hoursLogs.map(log => [
        log.date,
        log.startTime,
        log.endTime,
        log.hours.toFixed(2),
        `"${log.notes.replace(/"/g, '""')}"`,
        log.source.toUpperCase()
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `HTEC_Timesheet_Audit_Export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert("Timesheet CSV exported and downloaded.");
};

// Execute browser print dialogue
window.printTimesheet = function() {
    window.print();
};

// Send formatted monthly summary to the treasurer
window.emailTreasurer = function() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthName = monthNames[currentMonth];
    
    // Filter logs for this month
    const monthlyLogs = state.hoursLogs.filter(log => {
        const d = new Date(`${log.date}T00:00:00`);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
    
    if (monthlyLogs.length === 0) {
        alert("No hours logged for the current month yet!");
        return;
    }
    
    // Sort logs chronologically (oldest first)
    const sortedLogs = [...monthlyLogs].sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));
    
    let totalHours = 0;
    let logLines = "";
    
    sortedLogs.forEach(log => {
        totalHours += log.hours;
        
        const parsedDate = new Date(`${log.date}T00:00:00`);
        const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
        const prettyDate = parsedDate.toLocaleDateString('en-US', dateOptions);
        
        logLines += `${prettyDate} (${log.startTime} - ${log.endTime}): ${log.hours.toFixed(2)} hrs\n`;
        logLines += `Tasks: ${log.notes}\n`;
        logLines += `-------------------------------------------\n`;
    });
    
    const emailTo = "treasurer@holytrinitywenonah.org";
    const subject = `Holy Trinity Wenonah - Timesheet Submission for ${currentMonthName} ${currentYear}`;
    
    let body = `Dear Treasurer,\n\n`;
    body += `Please find my parish administrator working hours registry for the month of ${currentMonthName} ${currentYear} below:\n\n`;
    body += `===========================================\n`;
    body += `CUMULATIVE TOTAL HOURS: ${totalHours.toFixed(2)} hrs\n`;
    body += `===========================================\n\n`;
    body += `DETAILED WORK JOURNAL:\n\n`;
    body += logLines;
    body += `\nSubmitted securely via the Parish Administrator Timesheet Portal.\n`;
    
    const mailtoUrl = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    window.location.href = mailtoUrl;
};


