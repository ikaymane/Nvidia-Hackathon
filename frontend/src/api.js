// All calls to the Python backend live here.

async function call(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

// The user's local time, like "2026-10-21T18:30:05", so "tomorrow" means *their* tomorrow
// even if the server runs in another time zone.
function localNow() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

export const api = {
  state: () => call("GET", "/state"),
  command: (text) => call("POST", "/command", { text, now: localNow() }),
  confirm: (pending_id, yes) => call("POST", "/confirm", { pending_id, yes }),
  undo: () => call("POST", "/undo"),
  patchTask: (id, patch) => call("PATCH", `/tasks/${id}`, patch),
  deleteTask: (id) => call("DELETE", `/tasks/${id}`),
  forget: (key) => call("DELETE", `/memory/${encodeURIComponent(key)}`),
  chat: (text, history, trip) => call("POST", "/chat", { text, history, trip: trip || {}, now: localNow() }),
  saveMeeting: (transcript) => call("POST", "/meetings", { transcript }),
  summarizeMeeting: (id) => call("POST", `/meetings/${id}/summary`, { now: localNow() }),
  meetingTasks: (id) => call("POST", `/meetings/${id}/tasks`),
  deleteMeeting: (id) => call("DELETE", `/meetings/${id}`),
};
