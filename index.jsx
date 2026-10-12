

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CalendarDays, CheckCircle2, ClipboardList, Loader2, LogOut, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SHEET_ID = "16enYvPMJD0OWzbLLrgVrwLb04rfBTFrcQ5EhhMNuTFM";
const SHEET_NAMES = {
  admins: "Admins",
  users: "Users",
  tasks: "Tasks",
  leaves: "Leaves",
  thoughts: "Thoughts",
};
// This loader uses Google Sheets' GViz JSON endpoint.
// The Google Sheet must be shared as "Anyone with the link - Viewer".
function sheetUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&headers=1`;
}
function normalizeKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function cellValue(cell) {
  if (!cell) return "";
  return cell.f ?? cell.v ?? "";
}
function parseGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Google Sheets returned an unexpected response.");
  const payload = JSON.parse(text.slice(start, end + 1));
  if (payload.status === "error") {
    throw new Error(payload.errors?.[0]?.detailed_message || "Google Sheets query failed.");
  }


  const headers = (payload.table?.cols || []).map((col, index) =>
    String(col.label || col.id || `Column${index + 1}`)
  );


  return (payload.table?.rows || []).map(row => {
    const item = {};
    headers.forEach((header, index) => {
      item[normalizeKey(header)] = cellValue(row.c?.[index]);
    });
    return item;
  });
}

async function loadSheet(sheetName) {
  const response = await fetch(sheetUrl(sheetName), { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load the ${sheetName} sheet (${response.status}).`);
  return parseGviz(await response.text());
}


function firstValue(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[normalizeKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}


function toIsoDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const gvizDate = raw.match(/^Date\((\d+),(\d+),(\d+)/);
  if (gvizDate) {
    const [, year, zeroBasedMonth, day] = gvizDate;
    return `${year}-${String(Number(zeroBasedMonth) + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}


function mapUser(row, forcedRole) {
  return {
    userId: String(firstValue(row, ["UserID", "AdminID", "ID"])),
    password: String(firstValue(row, ["Password", "Pass"])),
    name: String(firstValue(row, ["FullName", "Name", "EmployeeName"])),
    role: forcedRole || String(firstValue(row, ["Role"], "User")),
    status: String(firstValue(row, ["ApprovalStatus", "Status"], "Pending")),
    active: String(firstValue(row, ["Active"], "Yes")),
  };
}


function mapTask(row) {
  return {
    id: String(firstValue(row, ["TaskID", "ID"])),
    title: String(firstValue(row, ["TaskTitle", "Title"])),
    description: String(firstValue(row, ["Description"])),
    owner: String(firstValue(row, ["AssignedTo", "Owner", "UserID"])),
    assignedBy: String(firstValue(row, ["AssignedBy"])),
    due: toIsoDate(firstValue(row, ["DueDate", "Due"])),
    status: String(firstValue(row, ["Status"], "Not Started")),
    priority: String(firstValue(row, ["Priority"], "Medium")),
    nextOwner: String(firstValue(row, ["NextAssignedTo", "NextOwner"])),
    handoffNotes: String(firstValue(row, ["HandoffNotes"])),
  };
}


function mapLeave(row) {
  return {
    id: String(firstValue(row, ["LeaveID", "ID"])),
    userId: String(firstValue(row, ["UserID"])),
    name: String(firstValue(row, ["EmployeeName", "FullName", "Name"])),
    from: toIsoDate(firstValue(row, ["StartDate", "From"])),
    to: toIsoDate(firstValue(row, ["EndDate", "To"])),
    type: String(firstValue(row, ["LeaveType", "Type"])),
    status: String(firstValue(row, ["Status"], "Pending")),
  };
}


function mapThought(row) {
  return {
    id: String(firstValue(row, ["ThoughtID", "ID"])),
    date: toIsoDate(firstValue(row, ["DisplayDate", "Date"])),
    text: String(firstValue(row, ["ThoughtText", "Thought", "Text"])),
    active: String(firstValue(row, ["Active"], "Yes")),
  };
}


function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dueStyle(due, status) {
  if (status === "Completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (!due) return "bg-slate-50 text-slate-800 border-slate-200";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${due}T00:00:00`);
  const days = Math.ceil((dueDate - today) / 86400000);
  if (days < 0) return "bg-red-950 text-white border-red-950";
  if (days === 0) return "bg-red-600 text-white border-red-600";
  if (days <= 2) return "bg-amber-100 text-amber-900 border-amber-300";
  return "bg-sky-50 text-sky-800 border-sky-200";
}

export default function App() {
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [login, setLogin] = useState({ userId: "", password: "" });
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastLoaded, setLastLoaded] = useState(null);
  async function refreshData() {
    setLoading(true);
    setLoadError("");
    try {
      const [adminRows, userRows, taskRows, leaveRows, thoughtRows] = await Promise.all([
        loadSheet(SHEET_NAMES.admins),
        loadSheet(SHEET_NAMES.users),
        loadSheet(SHEET_NAMES.tasks),
        loadSheet(SHEET_NAMES.leaves),
        loadSheet(SHEET_NAMES.thoughts),
      ]);


      const loadedUsers = [
        ...adminRows.map(row => mapUser(row, "Admin")),
        ...userRows.map(row => mapUser(row)),
      ].filter(user => user.userId);


      setUsers(loadedUsers);
      setTasks(taskRows.map(mapTask).filter(task => task.id));
      setLeaves(leaveRows.map(mapLeave).filter(leave => leave.id));
      setThoughts(thoughtRows.map(mapThought).filter(thought => thought.text));
      setLastLoaded(new Date());


      setCurrentUser(existing => {
        if (!existing) return null;
        return loadedUsers.find(user => user.userId === existing.userId) || null;
      });
    } catch (error) {
      setLoadError(`${error.message} Confirm the five tab names and share the Google Sheet as Anyone with the link - Viewer.`);
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    refreshData();
  }, []);


  const isAdmin = currentUser?.role?.toLowerCase() === "admin";
  const visibleTasks = useMemo(() => {
    const list = isAdmin ? tasks : tasks.filter(task => task.owner === currentUser?.userId);
    return [...list].sort((a, b) => {
      if (a.status === "Completed" && b.status !== "Completed") return 1;
      if (a.status !== "Completed" && b.status === "Completed") return -1;
      return new Date(a.due || "2999-12-31") - new Date(b.due || "2999-12-31");
    });
  }, [tasks, currentUser, isAdmin]);

  const thoughtOfDay = useMemo(() => {
    const today = localDateKey();
    return thoughts.find(item => item.date === today && item.active.toLowerCase() !== "no")?.text
      || thoughts.find(item => item.active.toLowerCase() !== "no")?.text
      || "Add today's thought in the Thoughts sheet.";
  }, [thoughts]);


  function signIn(event) {
    event.preventDefault();
    const found = users.find(user => user.userId === login.userId.trim() && user.password === login.password);
    if (!found) return setNotice("Invalid ID or password.");
    if (found.active.toLowerCase() === "no") return setNotice("This account is inactive.");
    if (found.status.toLowerCase() !== "approved") return setNotice("Your account is waiting for admin approval.");
    setCurrentUser(found);
    setNotice("");
    setPage("dashboard");
  }

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="text-center text-white mb-6">
            <ShieldCheck className="mx-auto h-12 w-12 text-cyan-300" />
            <h1 className="text-3xl font-bold mt-3">TeamFlow Portal</h1>
            <p className="text-slate-300 mt-2">Live data from Google Sheets</p>
          </div>


          <Card className="rounded-3xl shadow-2xl border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sign in</CardTitle>
              <Button variant="ghost" size="icon" onClick={refreshData} disabled={loading} title="Refresh sheet data">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 flex items-center justify-center gap-3 text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading Google Sheet data...
                </div>
              ) : loadError ? (
                <div className="rounded-2xl bg-red-50 text-red-800 p-4 text-sm">
                  <div className="flex gap-2 font-semibold"><AlertCircle className="h-5 w-5" /> Data connection failed</div>
                  <p className="mt-2">{loadError}</p>
                  <Button className="mt-4 rounded-xl" onClick={refreshData}>Retry</Button>
                </div>
              ) : (
                <form onSubmit={signIn} className="space-y-4">
                  <input className="w-full rounded-xl border p-3" placeholder="User ID" value={login.userId} onChange={event => setLogin({ ...login, userId: event.target.value })} />
                  <input className="w-full rounded-xl border p-3" placeholder="Password" type="password" value={login.password} onChange={event => setLogin({ ...login, password: event.target.value })} />
                  <Button className="w-full rounded-xl">Sign in</Button>
                </form>
              )}
              {notice && <p className="mt-4 text-sm rounded-xl bg-amber-50 text-amber-900 p-3">{notice}</p>}
              {lastLoaded && <p className="mt-4 text-xs text-slate-500 text-center">Sheet refreshed at {lastLoaded.toLocaleTimeString()}</p>}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    );
  }

  const nav = [
    ["dashboard", "Dashboard", Sparkles],
    ["tasks", "Tasks", ClipboardList],
    ["leaves", "Leaves", CalendarDays],
    ...(isAdmin ? [["admin", "Admin", Users]] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 bg-slate-950 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-xl">TeamFlow</div>
            <div className="text-xs text-slate-300">{currentUser.name || currentUser.userId} · {currentUser.role}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="rounded-xl" onClick={refreshData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="secondary" className="rounded-xl" onClick={() => setCurrentUser(null)}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </div>
      </header>


      <div className="max-w-7xl mx-auto p-4 grid lg:grid-cols-[220px_1fr] gap-5">
        <aside className="bg-white rounded-3xl p-3 shadow-sm h-fit border">
          <nav className="space-y-2">
            {nav.map(([id, label, Icon]) => (
              <button key={id} onClick={() => setPage(id)} className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left ${page === id ? "bg-indigo-600 text-white" : "hover:bg-slate-100"}`}>
                <Icon className="h-5 w-5" />{label}
              </button>
            ))}
          </nav>
        </aside>


        <main>
          {loadError && <div className="mb-4 rounded-2xl bg-red-50 text-red-800 border border-red-200 p-4">{loadError}</div>}
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {page === "dashboard" && (
                <div className="space-y-5">
                  <Card className="rounded-3xl bg-gradient-to-r from-indigo-600 to-cyan-500 text-white border-0">
                    <CardContent className="p-7 flex gap-3 items-start">
                      <Sparkles className="h-7 w-7 shrink-0" />
                      <div><p className="text-sm opacity-80">Thought of the day</p><h2 className="text-2xl font-semibold mt-1">{thoughtOfDay}</h2></div>
                    </CardContent>
                  </Card>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <Stat label={isAdmin ? "Open tasks" : "My open tasks"} value={visibleTasks.filter(task => task.status !== "Completed").length} />
                    <Stat label="Approved leaves" value={leaves.filter(leave => leave.status === "Approved").length} />
                    <Stat label="Pending users" value={isAdmin ? users.filter(user => user.status === "Pending").length : "—"} />
                  </div>
                  <Card className="rounded-3xl">
                    <CardHeader><CardTitle>Upcoming work</CardTitle></CardHeader>
                    <CardContent className="space-y-3">{visibleTasks.slice(0, 5).map(task => <TaskRow key={task.id} task={task} />)}</CardContent>
                  </Card>
                </div>
              )}


              {page === "tasks" && (
                <Card className="rounded-3xl">
                  <CardHeader><CardTitle>{isAdmin ? "All tasks" : "My tasks"}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">{visibleTasks.map(task => <TaskRow key={task.id} task={task} />)}</CardContent>
                </Card>
              )}


              {page === "leaves" && (
                <Card className="rounded-3xl">
                  <CardHeader><CardTitle>Team leave calendar</CardTitle></CardHeader>
                  <CardContent className="grid md:grid-cols-2 gap-4">
                    {leaves.map(leave => (
                      <div key={leave.id} className="rounded-2xl border p-4">
                        <div className="font-semibold">{leave.name || leave.userId}</div>
                        <div className="text-sm text-slate-600 mt-1">{leave.type}</div>
                        <div className="mt-3 text-sm">{leave.from} to {leave.to}</div>
                        <span className={`inline-block mt-3 text-xs px-2 py-1 rounded-full ${leave.status === "Approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{leave.status}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}


              {page === "admin" && isAdmin && (
                <Card className="rounded-3xl">
                  <CardHeader><CardTitle>User accounts from Google Sheets</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {users.map(user => (
                      <div key={`${user.role}-${user.userId}`} className="flex flex-wrap items-center justify-between gap-3 border rounded-2xl p-4">
                        <div><div className="font-semibold">{user.name || user.userId}</div><div className="text-sm text-slate-500">{user.userId} · {user.role}</div></div>
                        <span className={`text-sm rounded-full px-3 py-1 ${user.status === "Approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{user.status}</span>
                      </div>
                    ))}
                    <p className="text-xs text-slate-500">This version reads live data. Approval and task updates require a protected write API, such as Google Apps Script or a server endpoint.</p>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return <Card className="rounded-3xl"><CardContent className="p-5"><div className="text-sm text-slate-500">{label}</div><div className="text-3xl font-bold mt-2">{value}</div></CardContent></Card>;
}

function TaskRow({ task }) {
  return (
    <div className={`rounded-2xl border p-4 ${dueStyle(task.due, task.status)}`}>
      <div className="flex flex-wrap gap-3 justify-between">
        <div>
          <div className="font-semibold">{task.title || task.id}</div>
          {task.description && <div className="text-sm mt-1 opacity-90">{task.description}</div>}
          <div className="text-xs mt-2 opacity-80">{task.id} · Owner: {task.owner || "Unassigned"} · Due: {task.due || "No date"} · {task.priority}</div>
        </div>
        <span className="h-fit rounded-full bg-white/90 text-slate-900 border px-3 py-1 text-sm">{task.status}</span>
      </div>
      {task.nextOwner && <div className="mt-3 text-xs">Next handoff: {task.nextOwner}{task.handoffNotes ? ` · ${task.handoffNotes}` : ""}</div>}
    </div>
  );
}
