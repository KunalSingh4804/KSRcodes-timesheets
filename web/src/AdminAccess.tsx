import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { api, post } from "./api.js";
type Role = { id: string; name: string };
type Grant = {
  id: string;
  scope: string;
  role: Role;
  team?: { name: string };
  project?: { name: string };
};
type Person = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  entraTenantId: string | null;
  entraObjectId: string | null;
  roles: Grant[];
};
type Directory = {
  employees: Person[];
  teams: { id: string; name: string }[];
  projects: { id: string; name: string }[];
};
const scopes: Record<string, string[]> = {
  Employee: ["SELF"],
  Manager: ["TEAM"],
  ProjectManager: ["PROJECT"],
  HR: ["ORGANIZATION", "TEAM"],
  SystemAdmin: ["ORGANIZATION"],
  Auditor: ["ORGANIZATION", "TEAM"],
};
export default function AdminAccess({ roles }: { roles: Role[] }) {
  const client = useQueryClient();
  const directory = useQuery({
    queryKey: ["/admin/access-directory"],
    queryFn: () => api<Directory>("/admin/access-directory"),
  });
  const [mode, setMode] = useState("grant"),
    [employee, setEmployee] = useState(""),
    [roleId, setRoleId] = useState(""),
    [scope, setScope] = useState("SELF"),
    [resource, setResource] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [tenant, setTenant] = useState(""),
    [objectId, setObjectId] = useState(""),
    [success, setSuccess] = useState("");
  const selectedRole = roles.find((r) => r.id === roleId),
    allowedScopes = scopes[selectedRole?.name ?? "Employee"];
  const mutation = useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) =>
      method === "POST"
        ? post(path, body)
        : api(path, {
            method,
            ...(body ? { body: JSON.stringify(body) } : {}),
          }),
    onSuccess: async () => {
      setSuccess(
        "Access configuration saved and recorded in the audit history.",
      );
      await client.invalidateQueries();
    },
  });
  function send(path: string, body: unknown, method = "POST") {
    setSuccess("");
    mutation.mutate({ path, body, method });
  }
  const people = directory.data?.employees ?? [];
  return (
    <>
      <h2>Identity & access</h2>
      <p className="muted dialog-copy">
        Provision company identities and grant explicit roles. System
        administration does not automatically grant access to employee work.
      </p>
      <div className="tabs">
        {[
          ["grant", "Role assignments"],
          ["create", "Provision identity"],
          ["map", "Link Microsoft identity"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={mode === id ? "active" : ""}
            onClick={() => {
              setMode(id);
              setSuccess("");
              mutation.reset();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {(directory.error || mutation.error) && (
        <div className="error" role="alert">
          <AlertCircle size={17} />
          {(directory.error || mutation.error)?.message}
        </div>
      )}
      {success && (
        <div className="success">
          <CheckCircle2 size={17} />
          {success}
        </div>
      )}
      {mode === "grant" ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (window.confirm("Grant this role within the selected scope?"))
                send("/admin/roles", {
                  userId: employee,
                  roleId,
                  scope,
                  ...(scope === "TEAM"
                    ? { teamId: resource }
                    : scope === "PROJECT"
                      ? { projectId: resource }
                      : {}),
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
                  <option value="">Select employee</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Role
                <select
                  required
                  value={roleId}
                  onChange={(e) => {
                    const r = roles.find((r) => r.id === e.target.value);
                    setRoleId(e.target.value);
                    setScope(scopes[r?.name ?? "Employee"][0]);
                    setResource("");
                  }}
                >
                  <option value="">Select role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Resource scope
                <select
                  required
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setResource("");
                  }}
                >
                  {allowedScopes.map((s) => (
                    <option key={s} value={s}>
                      {s.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              {["TEAM", "PROJECT"].includes(scope) && (
                <label>
                  {scope === "TEAM" ? "Team" : "Project"}
                  <select
                    required
                    value={resource}
                    onChange={(e) => setResource(e.target.value)}
                  >
                    <option value="">Select {scope.toLowerCase()}</option>
                    {(scope === "TEAM"
                      ? directory.data?.teams
                      : directory.data?.projects
                    )?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <button className="button" disabled={mutation.isPending}>
              <ShieldCheck size={16} />
              Grant scoped role
            </button>
          </form>
          <div className="existing-config">
            <h3>Current assignments</h3>
            {people
              .filter((p) => !employee || p.id === employee)
              .map((p) => (
                <div key={p.id} className="access-person">
                  <strong>{p.name}</strong>
                  <small>{p.email}</small>
                  {p.roles.map((g) => (
                    <div className="access-grant" key={g.id}>
                      <span>
                        {g.role.name} ·{" "}
                        {g.team?.name ??
                          g.project?.name ??
                          g.scope.toLowerCase()}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Revoke ${g.role.name} from ${p.name}`}
                        disabled={mutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Revoke ${g.role.name} from ${p.name}?`,
                            )
                          )
                            send(`/admin/roles/${g.id}`, undefined, "DELETE");
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </>
      ) : mode === "create" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send("/admin/identities", {
              name,
              email,
              ...(tenant || objectId
                ? { entraTenantId: tenant, entraObjectId: objectId }
                : {}),
            });
          }}
        >
          <div className="form-grid">
            <label>
              Full name
              <input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Company email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Microsoft tenant ID (optional)
              <input
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                placeholder="Tenant UUID"
              />
            </label>
            <label>
              Microsoft object ID (optional)
              <input
                value={objectId}
                onChange={(e) => setObjectId(e.target.value)}
                placeholder="Immutable user object UUID"
              />
            </label>
          </div>
          <p className="muted dialog-copy">
            The Employee role is assigned on creation. Additional business
            authority must be granted explicitly. Sign-in requires both
            Microsoft identity IDs.
          </p>
          <button className="button" disabled={mutation.isPending}>
            <Plus size={16} />
            Provision employee identity
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (
              window.confirm(
                "Update this Microsoft identity mapping and revoke its existing application sessions?",
              )
            )
              send(
                `/admin/identities/${employee}`,
                { entraTenantId: tenant, entraObjectId: objectId },
                "PATCH",
              );
          }}
        >
          <div className="form-grid">
            <label className="full">
              Employee
              <select
                required
                value={employee}
                onChange={(e) => {
                  setEmployee(e.target.value);
                  const p = people.find((p) => p.id === e.target.value);
                  setTenant(p?.entraTenantId ?? "");
                  setObjectId(p?.entraObjectId ?? "");
                }}
              >
                <option value="">Select employee</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Microsoft tenant ID
              <input
                required
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
              />
            </label>
            <label>
              Immutable Microsoft object ID
              <input
                required
                value={objectId}
                onChange={(e) => setObjectId(e.target.value)}
              />
            </label>
          </div>
          <button className="button" disabled={mutation.isPending}>
            Save identity mapping
          </button>
        </form>
      )}
    </>
  );
}
