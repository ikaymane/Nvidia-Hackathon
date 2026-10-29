// Helpers to group tasks by when they are due and to show friendly labels.

function localISO(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const GROUPS = ["Overdue", "Today", "Tomorrow", "This week", "Later", "Anytime", "Done"];

export function groupOf(task) {
  if (task.done) return "Done";
  if (!task.due) return "Anytime";
  const today = localISO(new Date());
  if (task.due < today) return "Overdue";
  if (task.due === today) return "Today";
  if (task.due === localISO(addDays(new Date(), 1))) return "Tomorrow";
  if (task.due <= localISO(addDays(new Date(), 7))) return "This week";
  return "Later";
}

export function dueLabel(task) {
  if (!task.due) return null;
  const group = groupOf({ ...task, done: false });
  const date = new Date(`${task.due}T00:00`);
  let label;
  if (group === "Today" || group === "Tomorrow") label = group;
  else if (group === "This week") label = date.toLocaleDateString(undefined, { weekday: "long" });
  else label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return task.time ? `${label} · ${task.time}` : label;
}
