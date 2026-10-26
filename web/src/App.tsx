import AdminAccess from "./AdminAccess.js";
import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Infinity as InfinityIcon,
  LayoutDashboard,
  CalendarDays,
  Layers,
  FolderKanban,
  Users,
  BarChart3,
  ShieldCheck,
  Settings2,
  Bell,
  ChevronRight,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Send,
  Download,
  Search,
  X,
  Trash2,
  Pencil,
  LogOut,
  Menu,
  FileClock,
  AlertCircle,
  Building2,
  Copy,
} from "lucide-react";
import {
  api,
  post,
  ApiError,
  minutes,
  monthLabel,
  initials,
  csrf,
} from "./api.js";
type Any = any;
function useData(path: string, enabled = true) {
  return useQuery({ queryKey: [path], queryFn: () => api(path), enabled });
}
function Button({
  children,
  variant = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return (
    <button className={`button ${variant}`} {...props}>
      {children}
    </button>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value.toLowerCase()}`}>
      <i />
      {value.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <FileClock size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="error" role="alert">
      <AlertCircle size={17} />
      {error instanceof Error ? error.message : "Something went wrong"}
    </div>
  ) : null;
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button:not(:disabled),[role="dialog"] input,[role="dialog"] select,[role="dialog"] textarea',
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    document.querySelector<HTMLElement>('[role="dialog"] button')?.focus();
    return () => {
      document.removeEventListener("keydown", handle);
      old?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <div className="brand-icon">
        <InfinityIcon size={28} />
      </div>
      <div>
        <strong>MultiverseTech</strong>
        <span>S O L U T I O N S</span>
      </div>
    </div>
  );
}
function SignIn() {
  const client = useQueryClient();
  const config = useData("/auth/config");
  const users = useData(
    "/auth/development/users",
    config.data?.mode === "development",
  );
  const [selected, setSelected] = useState("");
  const login = useMutation({
    mutationFn: () =>
      post("/auth/development/login", {
        userId:
          selected ||
          users.data?.find((u: Any) => u.name === "Aarav Mehta")?.id ||
          users.data?.[0]?.id,
      }),
    onSuccess: () => client.invalidateQueries(),
  });
  return (
    <div className="sign-in">
      <div className="sign-in-story">
        <Brand />
        <div>
          <span className="eyebrow">THE MULTIVERSE WORKSPACE</span>
          <h1>
            Great work.
            <br />
            Every hour
            <br />
            <em>accounted for.</em>
          </h1>
          <p>
            A simpler way to track your contribution,
            <br />
            keep projects moving, and close the month.
          </p>
        </div>
        <small>MultiverseTech Solutions · Employee workspace</small>
      </div>
      <div className="sign-in-form">
        <span className="small-logo">
          <InfinityIcon />
        </span>
        <h2>Welcome to your workspace</h2>
        <p>One place for your time, projects and approvals.</p>
        {config.data?.mode === "development" ? (
          <>
            <div className="dev-note">
              <ShieldCheck size={19} />
              <div>
                <strong>Local development environment</strong>
                <span>
                  Fictional users and sample work policies. Company SSO is not
                  connected.
                </span>
              </div>
            </div>
            <label>
              Development identity
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Aarav Mehta · Employee</option>
                {users.data
                  ?.filter((u: Any) => u.name !== "Aarav Mehta")
                  .map((u: Any) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ·{" "}
                      {u.roles.map((r: Any) => r.role.name).join(", ")}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              onClick={() => login.mutate()}
              disabled={login.isPending || !users.data}
            >
              Enter workspace <ArrowRight size={17} />
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => window.location.assign("/auth/login")}
              disabled={!config.data?.configured}
            >
              <Building2 size={18} /> Continue with Microsoft
            </Button>
            {!config.data?.configured && (
              <p className="muted">
                Your administrator needs to configure Microsoft Entra ID.
              </p>
            )}
          </>
        )}
        <ErrorBox error={login.error || config.error || users.error} />
        <small>Authorized company access only.</small>
      </div>
    </div>
  );
}
export default function App() {
  const me = useData("/me");
  if (me.isPending)
    return (
      <div className="loading">
        <InfinityIcon size={36} />
        <p>Opening your workspace…</p>
      </div>
    );
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401)
      return <SignIn />;
    return (
      <div className="loading">
        <ErrorBox error={me.error} />
        <Button onClick={() => me.refetch()}>Try again</Button>
      </div>
    );
  }
  return <Workspace me={me.data} />;
}
function Workspace({ me }: { me: Any }) {
  const [mobile, setMobile] = useState(false),
    [periodId, setPeriodId] = useState("");
  const periods = useData("/reporting-periods");
  const location = useLocation();
  const client = useQueryClient();
  const notifications = useData("/notifications");
  const approvals = useData(
    "/approvals/inbox",
    me.permissions.includes("approval.decide"),
  );
  const current =
    periodId ||
    periods.data?.find(
      (p: Any) =>
        new Date(p.startsOn) <= new Date() &&
        new Date(p.endsOn + "") >=
          new Date(new Date().toISOString().slice(0, 10)),
    )?.id ||
    periods.data?.[0]?.id;
  const period = periods.data?.find((p: Any) => p.id === current);
  const nav = [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/timesheet", label: "My timesheet", icon: CalendarDays },
    { to: "/history", label: "Submission history", icon: Layers },
    ...(me.permissions.includes("approval.decide")
      ? [{ to: "/approvals", label: "Approvals", icon: ShieldCheck }]
      : []),
  ];
  const work = [
    { to: "/projects", label: "Projects", icon: FolderKanban },
    ...(me.permissions.includes("organization.read")
      ? [{ to: "/team", label: "People & teams", icon: Users }]
      : []),
    ...(me.permissions.includes("report.read")
      ? [{ to: "/reports", label: "Reports", icon: BarChart3 }]
      : []),
    ...(me.permissions.includes("audit.read") &&
    me.roles.some((r: string) => ["HR", "Auditor"].includes(r))
      ? [{ to: "/audit", label: "Audit trail", icon: FileClock }]
      : []),
  ];
  const title =
    [...nav, ...work, { to: "/settings", label: "Administration" }].find((n) =>
      location.pathname.startsWith(n.to),
    )?.label ?? "Workspace";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Brand />
        <div className="workspace-select">
          <span className="workspace-avatar">M</span>
          <div>
            <strong>Company workspace</strong>
            <small>MultiverseTech Solutions</small>
          </div>
        </div>
        <span className="nav-label">PERSONAL</span>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setMobile(false)}>
              <n.icon size={18} />
              {n.label}
              {n.to === "/approvals" && !!approvals.data?.length && (
                <b>{approvals.data.length}</b>
              )}
            </NavLink>
          ))}
        </nav>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {work.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setMobile(false)}>
              <n.icon size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Clock3 size={19} />
            </span>
            <strong>
              A little each day.
              <br />
              An easier month-end.
            </strong>
            <p>Keep your timesheet up to date as you go.</p>
            <Link to="/timesheet">
              Log your work <ArrowUpRight size={15} />
            </Link>
          </div>
          {me.permissions.includes("configuration.write") && (
            <NavLink className="settings-link" to="/settings">
              <Settings2 size={18} /> Administration
            </NavLink>
          )}
          <button
            className="profile"
            onClick={async () => {
              await post("/auth/logout", {});
              client.clear();
              window.location.assign("/");
            }}
            title="Sign out"
          >
            <span className="avatar">{initials(me.name)}</span>
            <span>
              <strong>{me.name}</strong>
              <small>
                {me.roles.filter((r: string) => r !== "Employee").join(", ") ||
                  "Employee"}
              </small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <i />
              {me.development ? "Development" : "Company workspace"}
            </span>
            <Link
              className="notification-icon"
              to="/notifications"
              aria-label="Notifications"
            >
              <Bell size={19} />
              {notifications.data?.some((n: Any) => !n.readAt) && <i />}
            </Link>
            <Link
              className="avatar small"
              to="/profile"
              aria-label="My profile"
            >
              {initials(me.name)}
            </Link>
          </div>
        </header>
        <main>
          <div className="page-tools">
            <span className="eyebrow">YOUR WORK, IN FOCUS</span>
            <label className="period-picker">
              <CalendarDays size={16} />
              <select
                aria-label="Reporting month"
                value={current ?? ""}
                onChange={(e) => setPeriodId(e.target.value)}
              >
                {periods.data?.map((p: Any) => (
                  <option key={p.id} value={p.id}>
                    {monthLabel(p.startsOn)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ErrorBox error={periods.error} />
          {
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  period ? <Dashboard me={me} period={period} /> : <NoPeriod />
                }
              />
              <Route
                path="/timesheet"
                element={
                  period ? (
                    <TimesheetPage me={me} period={period} />
                  ) : (
                    <NoPeriod />
                  )
                }
              />
              <Route path="/history" element={<History me={me} />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/team" element={<Team />} />
              <Route
                path="/reports"
                element={period ? <Reports period={period} /> : <NoPeriod />}
              />
              <Route path="/audit" element={<Audit />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/profile" element={<Profile me={me} />} />
              <Route
                path="*"
                element={
                  <Empty title="Page not found">
                    <Link to="/dashboard">Return to overview</Link>
                  </Empty>
                }
              />
            </Routes>
          }
          <footer>
            <span>© {new Date().getFullYear()} MultiverseTech Solutions</span>
            <span>Thoughtful work. Clear records.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function useOwnSheet(me: Any, period: Any) {
  const list = useData(`/timesheets?mine=true&periodId=${period.id}&limit=100`);
  const own = list.data?.find((s: Any) => s.userId === me.id);
  const sheet = useData(`/timesheets/${own?.id}`, !!own);
  return { list, sheet, own };
}
function Dashboard({ me, period }: { me: Any; period: Any }) {
  const { sheet, list } = useOwnSheet(me, period);
  const projects = useData("/projects");
  const s = sheet.data;
  const entries = s?.entries ?? [];
  const total = entries.reduce((n: number, e: Any) => n + e.minutes, 0),
    billable = entries
      .filter((e: Any) => e.billable)
      .reduce((n: number, e: Any) => n + e.minutes, 0);
  const submitted = (
    s?.versions?.find((v: Any) => v.kind === "SUBMITTED")?.entries ?? []
  ).reduce((n: number, e: Any) => n + e.minutes, 0);
  const approved = (
    s?.versions?.find((v: Any) =>
      ["APPROVED", "AMENDMENT_APPROVED"].includes(v.kind),
    )?.entries ?? []
  ).reduce((n: number, e: Any) => n + e.minutes, 0);
  const byProject = (projects.data ?? [])
    .map((p: Any) => ({
      ...p,
      total: entries
        .filter((e: Any) => e.projectId === p.id)
        .reduce((n: number, e: Any) => n + e.minutes, 0),
    }))
    .filter((p: Any) => p.total > 0);
  const recent = [...entries].reverse().slice(0, 4);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Welcome back, {me.name.split(" ")[0]}{" "}
            <span className="wave">✦</span>
          </h1>
          <p>Here’s a clear view of your time and what’s next.</p>
        </div>
        <Link className="button" to="/timesheet">
          <Plus size={17} /> Log time
        </Link>
      </div>
      <ErrorBox error={sheet.error || list.error} />
      <div className="overview-banner">
        <div>
          <span className="banner-kicker">MAKE EVERY CONTRIBUTION COUNT</span>
          <h2>Your month, coming together.</h2>
          <p>A little time logged today makes month-end a little easier.</p>
          <Link to="/timesheet">
            Continue your timesheet <ArrowRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="art-orbit one" />
          <div className="art-orbit two" />
          <div className="art-orbit three" />
          <div className="art-card">
            <div className="art-check">
              <Check size={24} />
            </div>
            <span>Work in balance</span>
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <div className="stats-grid">
        {[
          {
            label: "Recorded time",
            value: minutes(total),
            note: `${new Set(entries.map((e: Any) => e.workDate)).size} days with work logged`,
            icon: Clock3,
            color: "teal",
          },
          {
            label: "Submitted time",
            value: minutes(submitted),
            note: "Latest submission snapshot",
            icon: Send,
            color: "blue",
          },
          {
            label: "Approved time",
            value: minutes(approved),
            note: "Current approved snapshot",
            icon: CheckCircle2,
            color: "purple",
          },
          {
            label: "Billable time",
            value: minutes(billable),
            note: total
              ? `${Math.round((billable / total) * 100)}% of recorded time`
              : "No recorded time yet",
            icon: FolderKanban,
            color: "orange",
          },
        ].map((stat) => (
          <section className="stat-card" key={stat.label}>
            <div>
              <span>{stat.label}</span>
              <span className={`stat-icon ${stat.color}`}>
                <stat.icon size={18} />
              </span>
            </div>
            <strong>{stat.value}</strong>
            <small>{stat.note}</small>
          </section>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Monthly timesheet</h2>
              <p>{monthLabel(period.startsOn)} · Your progress at a glance</p>
            </div>
            <Status value={s?.status ?? "DRAFT"} />
          </div>
          <div className="timesheet-progress">
            <div className="progress-step done">
              <span>
                <Check size={15} />
              </span>
              <div>
                <strong>Record your time</strong>
                <small>
                  {total
                    ? `${entries.length} entries saved`
                    : "Ready when you are"}
                </small>
              </div>
            </div>
            <div
              className={`progress-step ${s && s.status !== "DRAFT" ? "done" : ""}`}
            >
              <span>
                <Send size={14} />
              </span>
              <div>
                <strong>Submit for review</strong>
                <small>
                  {s?.status === "DRAFT" || !s
                    ? "When your month is complete"
                    : "Submission recorded"}
                </small>
              </div>
            </div>
            <div
              className={`progress-step ${s?.status === "APPROVED" ? "done" : ""}`}
            >
              <span>
                <ShieldCheck size={15} />
              </span>
              <div>
                <strong>Get approved</strong>
                <small>
                  {s?.status === "APPROVED"
                    ? "All stages complete"
                    : "Following your configured workflow"}
                </small>
              </div>
            </div>
          </div>
          <div className="card-bottom">
            <span>
              <CalendarDays size={16} />
              {period.deadline
                ? `Due ${new Date(period.deadline).toLocaleDateString("en-IN")}`
                : "No submission deadline configured"}
            </span>
            <Link to="/timesheet">
              Open timesheet <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Time by project</h2>
              <p>Where your contribution goes</p>
            </div>
            <Link
              className="icon-button"
              to="/projects"
              aria-label="View projects"
            >
              <ArrowUpRight size={19} />
            </Link>
          </div>
          <div className="project-breakdown">
            {byProject.length ? (
              byProject.map((p: Any) => (
                <div key={p.id}>
                  <div className="project-bar-label">
                    <span>
                      <i style={{ background: p.color }} />
                      {p.name}
                    </span>
                    <strong>{minutes(p.total)}</strong>
                  </div>
                  <div className="bar-track">
                    <div
                      style={{
                        background: p.color,
                        width: `${(p.total / total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <Empty title="No time recorded yet">
                Your project breakdown will appear as you log work.
              </Empty>
            )}
          </div>
        </section>
      </div>
      <section className="card recent-card">
        <div className="card-heading">
          <div>
            <h2>Recent work entries</h2>
            <p>The latest contributions to your month</p>
          </div>
          <Link className="text-link" to="/timesheet">
            View all entries <ArrowRight size={15} />
          </Link>
        </div>
        {recent.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>WORK DATE</th>
                  <th>PROJECT & DESCRIPTION</th>
                  <th>CATEGORY</th>
                  <th>DURATION</th>
                  <th>CLASSIFICATION</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e: Any) => (
                  <tr key={e.id}>
                    <td>
                      {new Date(e.workDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td>
                      <strong className="project-cell">
                        <i style={{ background: e.project.color }} />
                        {e.project.name}
                      </strong>
                      <span className="description">{e.description}</span>
                    </td>
                    <td>
                      <span className="category">{e.category}</span>
                    </td>
                    <td>
                      <strong>{minutes(e.minutes)}</strong>
                    </td>
                    <td>
                      <span className={e.billable ? "billable" : "muted"}>
                        {e.billable ? "● Billable" : "Non-billable"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Your next contribution starts here">
            <Link to="/timesheet">Add your first work entry</Link>
          </Empty>
        )}
      </section>
      <div className="sample-footnote">
        <ShieldCheck size={14} />
        {me.development
          ? "Development data · Sample calendars, workflows and policies require company confirmation."
          : "All changes are protected by server permissions and recorded in history."}
      </div>
    </>
  );
}
const formEntry = z
  .object({
    projectId: z.string().min(1, "Choose a project"),
    workDate: z.string().min(1),
    description: z.string().trim().min(3).max(2000),
    hours: z.number().min(0).max(24),
    mins: z.number().int().min(0).max(59),
    category: z.string().min(1),
    billable: z.boolean(),
    remarks: z.string().max(2000),
  })
  .refine(
    (v) =>
      v.hours * 60 + v.mins > 0 &&
      Number.isInteger(v.hours * 60 + v.mins) &&
      v.hours * 60 + v.mins <= 1440,
    {
      message: "Enter a duration from 1 to 1440 whole minutes",
      path: ["hours"],
    },
  );
function EntryForm({
  entry,
  date,
  projects,
  categories,
  onSave,
  onClose,
  pending,
  error,
}: {
  entry?: Any;
  date: string;
  projects: Any[];
  categories: string[];
  onSave: (e: Any) => void;
  onClose: () => void;
  pending: boolean;
  error: unknown;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof formEntry>>({
    resolver: zodResolver(formEntry),
    defaultValues: {
      projectId: entry?.projectId ?? projects[0]?.id ?? "",
      workDate: entry?.workDate?.slice(0, 10) ?? date,
      description: entry?.description ?? "",
      hours: Math.floor((entry?.minutes ?? 0) / 60),
      mins: (entry?.minutes ?? 0) % 60,
      category: entry?.category ?? categories[0],
      billable: entry?.billable ?? true,
      remarks: entry?.remarks ?? "",
    },
  });
  return (
    <Modal
      title={entry ? "Edit work entry" : "Log your work"}
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit((v) =>
          onSave({
            projectId: v.projectId,
            workDate: v.workDate,
            description: v.description,
            minutes: v.hours * 60 + v.mins,
            category: v.category,
            billable: v.billable,
            remarks: v.remarks,
          }),
        )}
      >
        <div className="form-grid">
          <label>
            Work date
            <input type="date" {...register("workDate")} />
          </label>
          <label>
            Project
            <select {...register("projectId")}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            What did you work on?
            <textarea
              placeholder="Describe your contribution…"
              rows={3}
              {...register("description")}
            />
          </label>
          <div className="duration-fields">
            <label>
              Hours
              <input
                type="number"
                min="0"
                max="24"
                step="1"
                {...register("hours", { valueAsNumber: true })}
              />
            </label>
            <label>
              Minutes
              <input
                type="number"
                min="0"
                max="59"
                {...register("mins", { valueAsNumber: true })}
              />
            </label>
          </div>
          <label>
            Category
            <select {...register("category")}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="full">
            Remarks <span className="muted">(optional)</span>
            <input placeholder="Additional context" {...register("remarks")} />
          </label>
          <label className="checkbox full">
            <input type="checkbox" {...register("billable")} /> Billable work
          </label>
        </div>
        {Object.entries(errors).map(([k, e]) => (
          <p key={k} className="field-error">
            {e?.message}
          </p>
        ))}
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || !projects.length}>
            {pending ? "Saving…" : "Save entry"}
            <Check size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
const normalize = (e: Any) => ({
  projectId: e.projectId,
  workDate: e.workDate.slice(0, 10),
  description: e.description,
  minutes: e.minutes,
  category: e.category,
  billable: e.billable,
  remarks: e.remarks ?? "",
  ...(e.taskId ? { taskId: e.taskId } : {}),
});
function TimesheetPage({ me, period }: { me: Any; period: Any }) {
  const client = useQueryClient();
  const { sheet, own, list } = useOwnSheet(me, period);
  const projects = useData("/projects");
  const [date, setDate] = useState(""),
    [edit, setEdit] = useState<Any>(null),
    [confirm, setConfirm] = useState(false),
    [amending, setAmending] = useState(false),
    [proposal, setProposal] = useState<Any[]>([]),
    [reason, setReason] = useState(""),
    [search, setSearch] = useState("");
  const s = sheet.data;
  const entries = amending ? proposal : (s?.entries ?? []);
  const selected =
    date &&
    date >= period.startsOn.slice(0, 10) &&
    date <= period.endsOn.slice(0, 10)
      ? date
      : period.startsOn.slice(0, 7) +
        "-" +
        String(
          Math.min(new Date().getDate(), new Date(period.endsOn).getUTCDate()),
        ).padStart(2, "0");
  useEffect(() => {
    setAmending(false);
    setEdit(null);
    setDate("");
    setReason("");
  }, [period.id]);
  const invalidate = () => client.invalidateQueries();
  const create = useMutation({
    mutationFn: () => post("/timesheets", { periodId: period.id }),
    onSuccess: invalidate,
  });
  const save = useMutation({
    mutationFn: (updated: Any[]) =>
      api(`/timesheets/${s.id}/entries`, {
        method: "PUT",
        body: JSON.stringify({
          revision: s.revision,
          entries: updated.map(normalize),
        }),
      }),
    onSuccess: async () => {
      setEdit(null);
      await invalidate();
    },
  });
  const action = useMutation({
    mutationFn: (kind: string) =>
      post(
        `/timesheets/${s.id}/${kind}`,
        kind === "amendments"
          ? { revision: s.revision, reason, entries: proposal.map(normalize) }
          : { revision: s.revision },
      ),
    onSuccess: async () => {
      setConfirm(false);
      setAmending(false);
      setReason("");
      await invalidate();
    },
  });
  const update = (updated: Any[]) => {
    if (amending) {
      setProposal(updated);
      setEdit(null);
    } else save.mutate(updated);
  };
  const writable = s?.status === "DRAFT" || amending;
  const filtered = entries.filter(
    (e: Any) =>
      e.workDate.slice(0, 10) === selected &&
      (!search ||
        `${e.description} ${e.project?.name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const days = new Date(period.endsOn).getUTCDate(),
    offset = (new Date(period.startsOn).getUTCDay() + 6) % 7;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>My monthly timesheet</h1>
          <p>Make your work visible, one contribution at a time.</p>
        </div>
        <div className="heading-actions">
          {s && <Status value={s.status} />}{" "}
          {writable && (
            <Button onClick={() => setEdit({ index: -1 })}>
              <Plus size={16} /> Add entry
            </Button>
          )}
        </div>
      </div>
      <ErrorBox
        error={
          sheet.error ||
          list.error ||
          save.error ||
          action.error ||
          create.error
        }
      />
      {!own && !list.isPending ? (
        <section className="card">
          <Empty title="A new month, a fresh timesheet">
            Create your monthly draft to start recording work.
          </Empty>
          <div className="center-action">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Create monthly draft <Plus size={16} />
            </Button>
          </div>
        </section>
      ) : s ? (
        <>
          <div className="timesheet-summary">
            <span>
              <Clock3 size={18} />
              <strong>
                {minutes(
                  entries.reduce((n: number, e: Any) => n + e.minutes, 0),
                )}
              </strong>{" "}
              recorded
            </span>
            <span>{entries.length} entries</span>
            <span>Revision {s.revision}</span>
            <span className="push-right">
              {amending
                ? "Proposing changes · approved record stays unchanged"
                : s.status === "DRAFT"
                  ? "Changes save when you save an entry"
                  : "Submitted entries are protected"}
            </span>
          </div>
          {amending && (
            <div className="amendment-notice">
              <ShieldCheck size={20} />
              <div>
                <strong>Amendment request</strong>
                <p>
                  Edit the proposed entries, then explain the correction. The
                  approved version remains unchanged until all reviews pass.
                </p>
                <label>
                  Reason for correction
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why the approved timesheet needs to change"
                    rows={2}
                  />
                </label>
              </div>
            </div>
          )}
          <div className="timesheet-layout">
            <section className="card calendar">
              <div className="card-heading">
                <h2>{monthLabel(period.startsOn)}</h2>
                <CalendarDays size={18} />
              </div>
              <div className="calendar-grid">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span className="day-name" key={i}>
                    {d}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`blank${i}`} />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const day = `${period.startsOn.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
                    total = entries
                      .filter((e: Any) => e.workDate.slice(0, 10) === day)
                      .reduce((n: number, e: Any) => n + e.minutes, 0);
                  return (
                    <button
                      key={day}
                      aria-label={`${day}, ${minutes(total)} recorded`}
                      className={`${day === selected ? "selected" : ""} ${total ? "has-time" : ""}`}
                      onClick={() => setDate(day)}
                    >
                      <span>{i + 1}</span>
                      <small>{total ? minutes(total) : "·"}</small>
                    </button>
                  );
                })}
              </div>
              <div className="calendar-legend">
                <i /> Work logged <span>Selected day outlined</span>
              </div>
            </section>
            <section className="card daily-entries">
              <div className="card-heading">
                <div>
                  <h2>
                    {new Date(selected + "T00:00:00Z").toLocaleDateString(
                      "en-IN",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        timeZone: "UTC",
                      },
                    )}
                  </h2>
                  <p>
                    {minutes(
                      filtered.reduce((n: number, e: Any) => n + e.minutes, 0),
                    )}{" "}
                    recorded for this day
                  </p>
                </div>
                {writable && (
                  <button
                    className="icon-button"
                    title="Copy previous day's entries"
                    onClick={() => {
                      const previous = new Date(selected);
                      previous.setUTCDate(previous.getUTCDate() - 1);
                      const previousEntries = entries.filter(
                        (e: Any) =>
                          e.workDate.slice(0, 10) ===
                          previous.toISOString().slice(0, 10),
                      );
                      if (!previousEntries.length) {
                        window.alert(
                          "The previous day has no entries to copy.",
                        );
                        return;
                      }
                      update([
                        ...entries,
                        ...previousEntries.map((e: Any) => ({
                          ...normalize(e),
                          workDate: selected,
                        })),
                      ]);
                    }}
                  >
                    <Copy size={17} />
                  </button>
                )}
              </div>
              <div className="search-field">
                <Search size={16} />
                <input
                  aria-label="Search daily entries"
                  placeholder="Search entries…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {filtered.length ? (
                filtered.map((e: Any, i: number) => {
                  const project = projects.data?.find(
                    (p: Any) => p.id === e.projectId,
                  );
                  return (
                    <article className="entry-card" key={e.id ?? i}>
                      <div className="entry-project">
                        <span
                          className="project-badge"
                          style={{
                            background: (project?.color ?? "#15a389") + "18",
                            color: project?.color,
                          }}
                        >
                          <FolderKanban size={18} />
                        </span>
                        <div>
                          <strong>{project?.name ?? "Assigned project"}</strong>
                          <span>
                            {e.category} ·{" "}
                            {e.billable ? "Billable" : "Non-billable"}
                          </span>
                        </div>
                        <b>{minutes(e.minutes)}</b>
                      </div>
                      <p>{e.description}</p>
                      {writable && (
                        <div className="entry-actions">
                          <button
                            onClick={() =>
                              setEdit({ index: entries.indexOf(e), entry: e })
                            }
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm("Delete this work entry?"))
                                update(
                                  entries.filter(
                                    (_: Any, j: number) =>
                                      j !== entries.indexOf(e),
                                  ),
                                );
                            }}
                            disabled={save.isPending}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <Empty title="No entries for this day">
                  {writable
                    ? "Add a work entry to record your contribution."
                    : "Choose a highlighted date to review recorded work."}
                </Empty>
              )}
            </section>
          </div>
          <div className="submission-bar">
            <div>
              <ShieldCheck size={19} />
              <span>
                {s.status === "DRAFT"
                  ? "Ready for review? Submit once your month is complete."
                  : amending
                    ? "Your correction follows the configured approval workflow."
                    : "Your submission history is preserved."}
              </span>
            </div>
            <div>
              {amending ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setAmending(false)}
                  >
                    Cancel correction
                  </Button>
                  <Button
                    disabled={reason.trim().length < 5 || action.isPending}
                    onClick={() => action.mutate("amendments")}
                  >
                    Request amendment <Send size={16} />
                  </Button>
                </>
              ) : s.status === "DRAFT" ? (
                <Button
                  onClick={() => setConfirm(true)}
                  disabled={!entries.length}
                >
                  Submit month <Send size={16} />
                </Button>
              ) : ["RETURNED", "REJECTED"].includes(s.status) ? (
                <Button
                  onClick={() => action.mutate("reopen")}
                  disabled={action.isPending}
                >
                  Reopen for correction
                </Button>
              ) : s.status === "APPROVED" ? (
                <Button
                  onClick={() => {
                    setProposal(s.entries.map(normalize));
                    setAmending(true);
                  }}
                >
                  Request correction <Pencil size={16} />
                </Button>
              ) : (
                <span className="muted">Awaiting review</span>
              )}
            </div>
          </div>
          <section className="card timeline-card">
            <div className="card-heading">
              <div>
                <h2>Approval timeline</h2>
                <p>Every stage, decision and correction is preserved.</p>
              </div>
            </div>
            {s.approvals.length ? (
              s.approvals.map((i: Any) => (
                <div className="timeline-instance" key={i.id}>
                  <strong>
                    {i.amendmentId ? "Amendment" : "Submission"} ·{" "}
                    {i.workflow.name} v{i.workflow.version}
                  </strong>
                  {i.tasks
                    .sort(
                      (a: Any, b: Any) => a.stage.position - b.stage.position,
                    )
                    .map((t: Any) => (
                      <div key={t.id} className="timeline-row">
                        <span className="timeline-dot" />
                        <div>
                          <strong>{t.stage.name}</strong>
                          <small>
                            {t.approver.name}
                            {t.decision
                              ? ` · ${new Date(t.decision.createdAt).toLocaleString("en-IN")}`
                              : ""}
                          </small>
                          {t.decision?.reason && <p>{t.decision.reason}</p>}
                        </div>
                        <Status value={t.status} />
                      </div>
                    ))}
                </div>
              ))
            ) : (
              <Empty title="Your review journey starts after submission" />
            )}
          </section>
        </>
      ) : (
        <div className="loading-inline">Loading your timesheet…</div>
      )}
      {edit && (
        <EntryForm
          entry={edit.entry}
          date={selected}
          projects={projects.data ?? []}
          categories={period.policy.config.categories}
          onClose={() => setEdit(null)}
          pending={save.isPending}
          error={save.error}
          onSave={(value) => {
            const updated = [...entries];
            if (edit.index === -1) updated.push(value);
            else updated[edit.index] = value;
            update(updated);
          }}
        />
      )}
      {confirm && (
        <Modal
          title="Submit your monthly timesheet?"
          onClose={() => setConfirm(false)}
        >
          <p className="dialog-copy">
            You’re submitting{" "}
            <strong>
              {minutes(entries.reduce((n: number, e: Any) => n + e.minutes, 0))}
            </strong>{" "}
            across {entries.length} entries for {monthLabel(period.startsOn)}.
            Your entries will be locked while the configured reviewers make
            their decisions.
          </p>
          <ErrorBox error={action.error} />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Keep editing
            </Button>
            <Button
              disabled={action.isPending}
              onClick={() => action.mutate("submit")}
            >
              {action.isPending ? "Submitting…" : "Confirm submission"}
              <Send size={16} />
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function History({ me }: { me: Any }) {
  const sheets = useData("/timesheets?mine=true&limit=100");
  const [selected, setSelected] = useState("");
  const detail = useData(`/timesheets/${selected}`, !!selected);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Submission history</h1>
          <p>Your monthly records, decisions and preserved versions.</p>
        </div>
      </div>
      <ErrorBox error={sheets.error || detail.error} />
      <section className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>REPORTING MONTH</th>
                <th>STATUS</th>
                <th>RECORDED TIME</th>
                <th>LAST UPDATED</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sheets.data
                ?.filter((s: Any) => s.userId === me.id)
                .map((s: Any) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{monthLabel(s.period.startsOn)}</strong>
                    </td>
                    <td>
                      <Status value={s.status} />
                    </td>
                    <td>
                      {minutes(
                        s.entries.reduce(
                          (n: number, e: Any) => n + e.minutes,
                          0,
                        ),
                      )}
                    </td>
                    <td>{new Date(s.updatedAt).toLocaleDateString("en-IN")}</td>
                    <td>
                      <Button
                        variant="secondary small-button"
                        onClick={() => setSelected(s.id)}
                      >
                        View versions <ArrowUpRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!sheets.data?.length && <Empty title="No monthly records yet" />}
      </section>
      {selected && (
        <Modal
          title="Preserved submission versions"
          onClose={() => setSelected("")}
        >
          {detail.data?.versions.length ? (
            detail.data.versions.map((v: Any) => (
              <details className="version-detail" key={v.id}>
                <summary>
                  Version {v.number} · {v.kind.replaceAll("_", " ")}
                  <small>{new Date(v.createdAt).toLocaleString("en-IN")}</small>
                </summary>
                <div className="snapshot-entries">
                  {v.entries.map((e: Any, i: number) => (
                    <div key={i}>
                      <span>
                        {e.workDate} · {e.description}
                      </span>
                      <strong>{minutes(e.minutes)}</strong>
                    </div>
                  ))}
                </div>
              </details>
            ))
          ) : (
            <Empty title="No submitted versions yet">
              Versions are created when work is submitted or approved.
            </Empty>
          )}
        </Modal>
      )}
    </>
  );
}
function Approvals() {
  const client = useQueryClient();
  const inbox = useData("/approvals/inbox");
  const [selected, setSelected] = useState(""),
    [reason, setReason] = useState(""),
    [search, setSearch] = useState("");
  const detail = useData(`/approvals/${selected}`, !!selected);
  const decision = useMutation({
    mutationFn: (action: string) =>
      post(`/approvals/${selected}/${action}`, {
        revision: detail.data.revision,
        reason: reason.trim() || undefined,
      }),
    onSuccess: async () => {
      setSelected("");
      setReason("");
      await client.invalidateQueries();
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Approval inbox</h1>
          <p>Review the work that needs your attention.</p>
        </div>
        <span className="count-pill">
          {inbox.data?.length ?? 0} awaiting review
        </span>
      </div>
      <ErrorBox error={inbox.error} />
      <section className="card">
        <div className="card-heading">
          <h2>Pending decisions</h2>
          <div className="search-field compact">
            <Search size={16} />
            <input
              aria-label="Search approval inbox"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee…"
            />
          </div>
        </div>
        {inbox.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>EMPLOYEE</th>
                  <th>PERIOD</th>
                  <th>REVIEW STAGE</th>
                  <th>TYPE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inbox.data
                  .filter((t: Any) =>
                    t.employee.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((t: Any) => (
                    <tr key={t.id}>
                      <td>
                        <div className="person-cell">
                          <span className="avatar small">
                            {initials(t.employee)}
                          </span>
                          <strong>{t.employee}</strong>
                        </div>
                      </td>
                      <td>{monthLabel(t.period.startsOn)}</td>
                      <td>{t.stage}</td>
                      <td>
                        <span className="category">{t.kind.toLowerCase()}</span>
                      </td>
                      <td>
                        <Button
                          variant="secondary small-button"
                          onClick={() => {
                            decision.reset();
                            setSelected(t.id);
                          }}
                        >
                          Review <ArrowRight size={15} />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="You’re all caught up">
            New timesheets appear here when a configured workflow assigns a task
            to you.
          </Empty>
        )}
      </section>
      {selected && (
        <Modal title="Review timesheet" onClose={() => setSelected("")}>
          <ErrorBox error={detail.error || decision.error} />
          {detail.data && (
            <>
              <div className="review-summary">
                <span className="avatar">{initials(detail.data.employee)}</span>
                <div>
                  <h3>{detail.data.employee}</h3>
                  <p>
                    {monthLabel(detail.data.period.startsOn)} ·{" "}
                    {detail.data.stage}
                  </p>
                </div>
                <strong>
                  {minutes(
                    detail.data.entries.reduce(
                      (n: number, e: Any) => n + e.minutes,
                      0,
                    ),
                  )}
                </strong>
              </div>
              {detail.data.amendmentReason && (
                <div className="dev-note">
                  <div>
                    <strong>Amendment reason</strong>
                    <p>{detail.data.amendmentReason}</p>
                  </div>
                </div>
              )}
              <>
                {detail.data.originalEntries && (
                  <details className="version-detail">
                    <summary>Review original approved entries</summary>
                    <div className="snapshot-entries">
                      {detail.data.originalEntries.map((e: Any, i: number) => (
                        <div key={i}>
                          <span>
                            {e.workDate} · {e.description}
                          </span>
                          <strong>{minutes(e.minutes)}</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
              <div className="review-entries">
                {detail.data.entries.map((e: Any, i: number) => (
                  <div key={i}>
                    <div>
                      <strong>{e.project?.name}</strong>
                      <small>
                        {e.workDate} · {e.category}
                      </small>
                      <p>{e.description}</p>
                    </div>
                    <b>{minutes(e.minutes)}</b>
                  </div>
                ))}
              </div>
              <label>
                Decision comment{" "}
                <span className="muted">
                  (required for return or rejection)
                </span>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Add context for the employee…"
                />
              </label>
              <div className="modal-actions">
                <Button
                  variant="danger"
                  disabled={!reason.trim() || decision.isPending}
                  onClick={() => {
                    if (window.confirm("Reject this submission?"))
                      decision.mutate("reject");
                  }}
                >
                  Reject
                </Button>
                {!detail.data.amendmentReason && (
                  <Button
                    variant="secondary"
                    disabled={!reason.trim() || decision.isPending}
                    onClick={() => decision.mutate("return")}
                  >
                    Return
                  </Button>
                )}
                <Button
                  disabled={decision.isPending}
                  onClick={() => {
                    if (window.confirm("Approve this stage of the submission?"))
                      decision.mutate("approve");
                  }}
                >
                  <Check size={16} />
                  Approve
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function Projects() {
  const projects = useData("/projects");
  const [search, setSearch] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your projects</h1>
          <p>The workstreams you’re part of.</p>
        </div>
      </div>
      <div className="search-field project-search">
        <Search size={17} />
        <input
          placeholder="Find a project…"
          aria-label="Search projects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorBox error={projects.error} />
      <div className="project-grid">
        {projects.data
          ?.filter((p: Any) =>
            p.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((p: Any) => (
            <section className="card project-tile" key={p.id}>
              <span
                className="project-tile-icon"
                style={{ color: p.color, background: p.color + "18" }}
              >
                <FolderKanban size={26} />
              </span>
              <span className="category">{p.code}</span>
              <h2>{p.name}</h2>
              <p>{p.active ? "Active project" : "Archived project"}</p>
              <div className="project-tile-bottom">
                <span>
                  <i style={{ background: p.color }} />
                  {p.assignments.length ? "You’re assigned" : "Company project"}
                </span>
                <Link to="/timesheet" aria-label={`Log time for ${p.name}`}>
                  <ArrowUpRight size={20} />
                </Link>
              </div>
            </section>
          ))}
      </div>
      {!projects.data?.length && (
        <section className="card">
          <Empty title="No assigned projects">
            Ask an authorized administrator to check your project assignments.
          </Empty>
        </section>
      )}
    </>
  );
}
function Team() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(""),
    [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState("");
  const client = useQueryClient(),
    teams = useData("/organization/teams"),
    me = useData("/me");
  const pageResult = useQuery({
    queryKey: ["employee-page", page, search],
    queryFn: () =>
      api(
        `/employees?page=${page}&limit=25&search=${encodeURIComponent(search)}`,
        {},
        true,
      ),
  });
  const employees = { ...pageResult, data: pageResult.data?.data };
  const create = useMutation({
    mutationFn: () => post("/employees", { name, email }),
    onSuccess: () => {
      setAdding(false);
      setName("");
      setEmail("");
      return client.invalidateQueries();
    },
  });
  const toggle = useMutation({
    mutationFn: (u: Any) =>
      api(`/employees/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !u.active }),
      }),
    onSuccess: () => client.invalidateQueries(),
  });
  const admin = me.data?.permissions.includes("organization.write");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>People & teams</h1>
          <p>Your authorized view of the company directory.</p>
        </div>
        {admin && (
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} />
            Add employee
          </Button>
        )}
      </div>
      <ErrorBox error={employees.error || teams.error || toggle.error} />
      <div className="team-pills">
        {teams.data?.map((t: Any) => (
          <span key={t.id}>
            <Users size={17} />
            <strong>{t.name}</strong>
            <small>
              {t.memberships.filter((m: Any) => m.user.active).length} members
            </small>
          </span>
        ))}
      </div>
      <section className="card">
        <div className="card-heading">
          <h2>Employee directory</h2>
          <div className="search-field compact">
            <Search size={16} />
            <input
              aria-label="Search employees"
              placeholder="Search people…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>EMAIL</th>
                <th>ROLES</th>
                <th>STATUS</th>
                {admin && <th />}
              </tr>
            </thead>
            <tbody>
              {employees.data
                ?.filter((u: Any) =>
                  `${u.name} ${u.email}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((u: Any) => (
                  <tr key={u.id}>
                    <td>
                      <div className="person-cell">
                        <span className="avatar small">{initials(u.name)}</span>
                        <strong>{u.name}</strong>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>{u.roles.map((r: Any) => r.role.name).join(", ")}</td>
                    <td>
                      <Status value={u.active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    {admin && (
                      <td>
                        <Button
                          variant="secondary small-button"
                          disabled={u.id === me.data?.id || toggle.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `${u.active ? "Deactivate" : "Activate"} ${u.name}?`,
                              )
                            )
                              toggle.mutate(u);
                          }}
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>
            {pageResult.data?.meta.total ?? 0} employees · Page {page}
          </span>
          <Button
            variant="secondary small-button"
            disabled={page === 1 || pageResult.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary small-button"
            disabled={
              page * 25 >= (pageResult.data?.meta.total ?? 0) ||
              pageResult.isFetching
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </section>
      {adding && (
        <Modal title="Add employee" onClose={() => setAdding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="form-grid">
              <label className="full">
                Full name
                <input
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="full">
                Company email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </div>
            <p className="muted dialog-copy">
              New employees receive the employee role. Their immutable Entra
              identity must be provisioned before company SSO access.
            </p>
            <ErrorBox error={create.error} />
            <div className="modal-actions">
              <Button disabled={create.isPending}>Create employee</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function Reports({ period }: { period: Any }) {
  const report = useData(`/reports/monthly?periodId=${period.id}`);
  const [error, setError] = useState<unknown>(null),
    [search, setSearch] = useState("");
  async function download() {
    try {
      const response = await fetch("/api/v1/exports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
        body: JSON.stringify({ periodId: period.id }),
      });
      if (!response.ok) throw new Error((await response.json()).error.message);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `MultiverseTech-${period.startsOn.slice(0, 7)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Monthly reporting</h1>
          <p>
            Recorded, submitted and approved effort — clearly distinguished.
          </p>
        </div>
        <Button variant="secondary" onClick={download}>
          <Download size={16} />
          Export CSV
        </Button>
      </div>
      <ErrorBox error={report.error || error} />
      <div className="stats-grid">
        {["recorded", "submitted", "approved", "billable"].map((k) => (
          <section className="stat-card" key={k}>
            <div>
              <span>{k[0].toUpperCase() + k.slice(1)} time</span>
              <Clock3 size={17} />
            </div>
            <strong>{minutes(report.data?.totals[k] ?? 0)}</strong>
            <small>Within your authorized scope</small>
          </section>
        ))}
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Employee completion</h2>
            <p>
              {report.data?.projectScoped
                ? "Only effort for your authorized projects is included."
                : `Policy target: ${minutes(report.data?.expectedPerEmployee ?? 0)} per employee in this period`}
            </p>
          </div>
          <div className="search-field compact">
            <Search size={15} />
            <input
              aria-label="Search report"
              placeholder="Search employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>STATUS</th>
                <th>RECORDED</th>
                <th>SUBMITTED</th>
                <th>APPROVED</th>
                <th>DEADLINE</th>
              </tr>
            </thead>
            <tbody>
              {report.data?.rows
                .filter((r: Any) =>
                  r.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((r: Any) => (
                  <tr key={r.userId}>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td>{minutes(r.recorded)}</td>
                    <td>{minutes(r.submitted)}</td>
                    <td>{minutes(r.approved)}</td>
                    <td>
                      {r.overdue ? (
                        <span className="field-error">Overdue</span>
                      ) : period.deadline ? (
                        "Within deadline"
                      ) : (
                        "Not configured"
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function Audit() {
  const events = useData("/audit-events?limit=100");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Audit trail</h1>
          <p>Accountable changes. A history you can follow.</p>
        </div>
        <span className="count-pill">
          <ShieldCheck size={15} />
          Read only
        </span>
      </div>
      <ErrorBox error={events.error} />
      <section className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>WHEN</th>
                <th>ACTOR</th>
                <th>ACTION</th>
                <th>REFERENCE</th>
              </tr>
            </thead>
            <tbody>
              {events.data?.map((e: Any) => (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleString("en-IN")}</td>
                  <td>{e.actor.name}</td>
                  <td>
                    <span className="category">
                      {e.action.replaceAll("_", " ").toLowerCase()}
                    </span>
                  </td>
                  <td>
                    <code title={e.correlationId}>
                      {e.targetId.slice(0, 8)}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!events.data?.length && <Empty title="No audit events in this view" />}
      </section>
    </>
  );
}
function Notifications() {
  const events = useData("/notifications"),
    client = useQueryClient();
  const read = useMutation({
    mutationFn: (id: string) => post(`/notifications/${id}/read`, {}),
    onSuccess: () => client.invalidateQueries(),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>
          <p>Your submissions and decisions, kept in view.</p>
        </div>
      </div>
      <ErrorBox error={events.error || read.error} />
      <section className="card">
        {events.data?.length ? (
          events.data.map((n: Any) => (
            <div
              className={`notification-row ${n.readAt ? "read" : ""}`}
              key={n.id}
            >
              <span className="notification-bubble">
                <Bell size={19} />
              </span>
              <div>
                <p>{n.message}</p>
                <small>{new Date(n.createdAt).toLocaleString("en-IN")}</small>
              </div>
              {!n.readAt && (
                <Button
                  variant="secondary small-button"
                  onClick={() => read.mutate(n.id)}
                >
                  Mark read
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty title="Nothing new here" />
        )}
      </section>
    </>
  );
}
function Settings() {
  const me = useData("/me");
  const canManagePeople = me.data?.permissions.includes("organization.write");
  const canManageAccess = me.data?.permissions.includes("access.write");
  const client = useQueryClient(),
    config = useData("/admin/configuration"),
    employees = useData("/employee-options", !!canManagePeople),
    projects = useData("/projects");
  const [tab, setTab] = useState("workflow"),
    [name, setName] = useState("Monthly approval"),
    [stages, setStages] = useState(["REPORTING_MANAGER", "HR_GROUP"]);
  const [employee, setEmployee] = useState(""),
    [project, setProject] = useState(""),
    [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(
      "Development, Meetings, Research, Support",
    ),
    [target, setTarget] = useState(480),
    [max, setMax] = useState(""),
    [days, setDays] = useState([1, 2, 3, 4, 5]),
    [calendar, setCalendar] = useState(""),
    [policy, setPolicy] = useState(""),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [holidays, setHolidays] = useState(""),
    [deadline, setDeadline] = useState(""),
    [success, setSuccess] = useState("");
  const [allowFuture, setAllowFuture] = useState(false),
    [allowLate, setAllowLate] = useState(true);
  const mutate = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      post(path, body),
    onSuccess: async () => {
      setSuccess(
        "Configuration saved. Existing submitted records retain their original configuration.",
      );
      await client.invalidateQueries();
    },
  });
  const send = (path: string, body: unknown) => {
    setSuccess("");
    mutate.mutate({ path, body });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Workspace administration</h1>
          <p>Explicit policies. Versioned decisions. Controlled access.</p>
        </div>
      </div>
      <ErrorBox error={config.error || mutate.error} />
      {success && (
        <div className="success">
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}
      <div className="tabs">
        {[
          ["workflow", "Approval workflow"],
          ["policy", "Work policies"],
          ["calendar", "Calendars"],
          ["period", "Reporting periods"],
          ...(canManagePeople ? [["assignment", "Project assignments"]] : []),
          ...(canManageAccess ? [["access", "Identity & access"]] : []),
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => {
              setTab(id);
              setSuccess("");
              mutate.reset();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {config.data && (
        <section className="card settings-card">
          {tab === "access" ? (
            <AdminAccess roles={config.data.roles} />
          ) : tab === "workflow" ? (
            <>
              <h2>Approval workflow</h2>
              <p className="muted">
                Publishing creates a new version for future submissions. Every
                configured approver in a stage must approve.
              </p>
              <div className="workflow-current">
                {config.data.workflows
                  .filter((w: Any) => w.active)
                  .map((w: Any) => (
                    <div key={w.id}>
                      <Status value="ACTIVE" />
                      <strong>
                        {w.name} · v{w.version}
                      </strong>
                      <p>{w.stages.map((s: Any) => s.name).join(" → ")}</p>
                    </div>
                  ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    window.confirm(
                      "Publish this workflow for future submissions?",
                    )
                  )
                    send("/admin/workflows", {
                      name,
                      stages: stages.map((resolver, i) => ({
                        resolver,
                        name: `Stage ${i + 1}: ${resolver.replaceAll("_", " ").toLowerCase()}`,
                      })),
                    });
                }}
              >
                <label>
                  Workflow name
                  <input
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="workflow-stages">
                  {stages.map((s, i) => (
                    <div key={i}>
                      <span>{i + 1}</span>
                      <select
                        aria-label={`Stage ${i + 1} approver`}
                        value={s}
                        onChange={(e) =>
                          setStages(
                            stages.map((x, j) =>
                              j === i ? e.target.value : x,
                            ),
                          )
                        }
                      >
                        <option value="REPORTING_MANAGER">
                          Reporting manager
                        </option>
                        <option value="PROJECT_MANAGER">
                          Project manager · each project
                        </option>
                        <option value="HR_GROUP">Authorized HR group</option>
                      </select>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove stage ${i + 1}`}
                        disabled={stages.length === 1}
                        onClick={() =>
                          setStages(stages.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="settings-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={stages.length >= 6}
                    onClick={() => setStages([...stages, "HR_GROUP"])}
                  >
                    <Plus size={15} />
                    Add stage
                  </Button>
                  <Button disabled={mutate.isPending}>
                    Publish new version <Send size={16} />
                  </Button>
                </div>
              </form>
            </>
          ) : tab === "assignment" ? (
            <>
              <h2>Assign an employee to a project</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send("/project-assignments", {
                    userId: employee,
                    projectId: project,
                    startsOn: start,
                  });
                }}
              >
                <div className="form-grid">
                  <label>
                    Employee
                    <select
                      required
                      value={employee}
                      onChange={(e) => setEmployee(e.target.value)}
                    >
                      <option value="">Choose employee</option>
                      {employees.data?.map((u: Any) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Project
                    <select
                      required
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    >
                      <option value="">Choose project</option>
                      {projects.data?.map((p: Any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Effective from
                    <input
                      required
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                </div>
                <Button disabled={mutate.isPending}>Create assignment</Button>
              </form>
            </>
          ) : tab === "calendar" ? (
            <>
              <h2>Create a work calendar</h2>
              <p className="muted">
                Published policies reference a specific calendar. Create a new
                calendar for changes.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send("/admin/calendars", {
                    name,
                    holidays: holidays
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  });
                }}
              >
                <label>
                  Calendar name
                  <input
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Holiday dates
                  <textarea
                    rows={3}
                    placeholder="2026-12-25, 2027-01-01"
                    value={holidays}
                    onChange={(e) => setHolidays(e.target.value)}
                  />
                  <small>Comma-separated dates in YYYY-MM-DD format.</small>
                </label>
                <Button disabled={mutate.isPending}>Create calendar</Button>
              </form>
              <div className="existing-config">
                {config.data.calendars.map((c: Any) => (
                  <p key={c.id}>
                    <CalendarDays size={16} />
                    {c.name} · {c.holidays.length} holidays
                  </p>
                ))}
              </div>
            </>
          ) : tab === "policy" ? (
            <>
              <h2>Create a versioned work policy</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send("/admin/policies", {
                    name,
                    calendarId: calendar || config.data.calendars[0]?.id,
                    config: {
                      workingDays: days,
                      targetMinutes: target,
                      maxDailyMinutes: max ? Number(max) : null,
                      categories: category
                        .split(",")
                        .map((c) => c.trim())
                        .filter(Boolean),
                      allowLate,
                      allowFuture,
                    },
                  });
                }}
              >
                <div className="form-grid">
                  <label>
                    Policy name
                    <input
                      required
                      minLength={2}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Calendar
                    <select
                      value={calendar}
                      onChange={(e) => setCalendar(e.target.value)}
                    >
                      {config.data.calendars.map((c: Any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Daily target in minutes
                    <input
                      type="number"
                      min="0"
                      max="1440"
                      required
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Daily maximum in minutes
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={max}
                      placeholder="No policy cap"
                      onChange={(e) => setMax(e.target.value)}
                    />
                  </label>
                  <label className="full">
                    Permitted work categories
                    <input
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    />
                    <small>Separate categories with commas.</small>
                  </label>
                </div>
                <label>Working days</label>
                <div className="day-checkboxes">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (d, i) => (
                      <label key={d}>
                        <input
                          type="checkbox"
                          checked={days.includes(i)}
                          onChange={(e) =>
                            setDays(
                              e.target.checked
                                ? [...days, i]
                                : days.filter((x) => x !== i),
                            )
                          }
                        />
                        {d}
                      </label>
                    ),
                  )}
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={allowLate}
                    onChange={(e) => setAllowLate(e.target.checked)}
                  />
                  Allow submissions after the deadline
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={allowFuture}
                    onChange={(e) => setAllowFuture(e.target.checked)}
                  />
                  Allow future work entries
                </label>
                <Button disabled={mutate.isPending}>
                  Create policy version
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2>Create a reporting month</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const [y, m] = month.split("-").map(Number);
                  send("/admin/reporting-periods", {
                    startsOn: month + "-01",
                    endsOn: new Date(Date.UTC(y, m, 0))
                      .toISOString()
                      .slice(0, 10),
                    policyId: policy || config.data.policies[0]?.id,
                    deadline: deadline
                      ? new Date(deadline + "Z").toISOString()
                      : null,
                  });
                }}
              >
                <div className="form-grid">
                  <label>
                    Reporting month
                    <input
                      type="month"
                      required
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                    />
                  </label>
                  <label>
                    Work policy
                    <select
                      value={policy}
                      onChange={(e) => setPolicy(e.target.value)}
                    >
                      {config.data.policies.map((p: Any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · v{p.version}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Submission deadline in UTC (optional)
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </label>
                <p className="muted">
                  Leave the deadline blank if this month has no submission
                  cutoff.
                </p>
                <Button disabled={mutate.isPending}>
                  Create reporting period
                </Button>
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}

function NoPeriod() {
  return (
    <section className="card">
      <Empty title="No reporting periods yet">
        An authorized administrator can create a calendar, work policy and
        reporting month in <Link to="/settings">Administration</Link>.
      </Empty>
    </section>
  );
}

function Profile({ me }: { me: Any }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>My profile</h1>
          <p>Your company identity and workspace access.</p>
        </div>
      </div>
      <section className="card settings-card">
        <div className="review-summary">
          <span className="avatar">{initials(me.name)}</span>
          <div>
            <h2>{me.name}</h2>
            <p>{me.email}</p>
          </div>
        </div>
        <div className="existing-config">
          <p>
            <Building2 size={16} />
            {me.organization.name}
          </p>
          <p>
            <Clock3 size={16} />
            {me.organization.timezone}
          </p>
          <p>
            <ShieldCheck size={16} />
            {me.roles.join(", ")}
          </p>
        </div>
        <p className="muted dialog-copy">
          Company identity and access are managed by authorized administrators.
        </p>
      </section>
    </>
  );
}
