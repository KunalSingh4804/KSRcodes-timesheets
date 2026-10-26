import { writeFileSync } from "node:fs";
import { z } from "zod";
import { entrySchema, policySchema } from "../server/src/domain.js";
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const obj = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
const string = { type: "string" },
  uuid = { type: "string", format: "uuid" },
  integer = { type: "integer", minimum: 0 };
const schemas: Record<string, unknown> = {
  Entry: z.toJSONSchema(entrySchema),
  Policy: z.toJSONSchema(policySchema),
  Error: obj({
    error: obj({ message: string, correlationId: string }, ["message"]),
  }),
  Revision: obj({ revision: integer }),
  CreateTimesheet: obj({ periodId: uuid }),
  ReplaceEntries: obj({
    revision: integer,
    entries: { type: "array", maxItems: 2000, items: ref("Entry") },
  }),
  Decision: obj(
    { revision: integer, reason: { type: "string", maxLength: 2000 } },
    ["revision"],
  ),
  Amendment: obj({
    revision: integer,
    reason: { type: "string", minLength: 5, maxLength: 2000 },
    entries: {
      type: "array",
      minItems: 1,
      maxItems: 2000,
      items: ref("Entry"),
    },
  }),
  Employee: obj(
    {
      name: string,
      email: { type: "string", format: "email" },
      entraTenantId: uuid,
      entraObjectId: uuid,
    },
    ["name", "email"],
  ),
  EmployeeUpdate: obj(
    {
      active: { type: "boolean" },
      managerId: { type: ["string", "null"], format: "uuid" },
    },
    [],
  ),
  Project: obj(
    {
      name: string,
      code: { type: "string", pattern: "^[A-Z0-9-]{2,20}$" },
      managerId: uuid,
    },
    ["name", "code"],
  ),
  Assignment: obj(
    {
      userId: uuid,
      projectId: uuid,
      startsOn: { type: "string", format: "date" },
      endsOn: { type: ["string", "null"], format: "date" },
    },
    ["userId", "projectId", "startsOn"],
  ),
  Workflow: obj({
    name: string,
    stages: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: obj({
        name: string,
        resolver: {
          type: "string",
          enum: ["REPORTING_MANAGER", "PROJECT_MANAGER", "HR_GROUP"],
        },
      }),
    },
  }),
  CreatePolicy: obj({ name: string, calendarId: uuid, config: ref("Policy") }),
  Calendar: obj({
    name: string,
    holidays: {
      type: "array",
      maxItems: 366,
      items: { type: "string", format: "date" },
    },
  }),
  Period: obj({
    startsOn: { type: "string", format: "date" },
    endsOn: { type: "string", format: "date" },
    policyId: uuid,
    deadline: { type: ["string", "null"], format: "date-time" },
  }),
  Grant: obj(
    {
      userId: uuid,
      roleId: uuid,
      scope: {
        type: "string",
        enum: ["SELF", "TEAM", "PROJECT", "ORGANIZATION"],
      },
      teamId: uuid,
      projectId: uuid,
    },
    ["userId", "roleId", "scope"],
  ),
  Team: obj({ name: string, department: string }),
  Membership: obj(
    {
      userId: uuid,
      startsOn: { type: "string", format: "date" },
      endsOn: { type: ["string", "null"], format: "date" },
    },
    ["userId", "startsOn"],
  ),
  Identity: obj({ entraTenantId: uuid, entraObjectId: uuid }),
  Entity: { type: "object", additionalProperties: true },
  TimesheetSummary: obj({
    id: uuid,
    userId: uuid,
    periodId: uuid,
    status: {
      type: "string",
      enum: [
        "DRAFT",
        "SUBMITTED",
        "IN_APPROVAL",
        "APPROVED",
        "RETURNED",
        "REJECTED",
      ],
    },
    revision: integer,
    currentVersion: integer,
    entries: { type: "array", items: ref("Entity") },
    period: ref("Entity"),
    user: ref("Entity"),
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  }),
  TimesheetDetail: {
    allOf: [
      ref("TimesheetSummary"),
      {
        type: "object",
        properties: {
          versions: { type: "array", items: ref("Entity") },
          approvals: { type: "array", items: ref("Entity") },
          amendments: { type: "array", items: ref("Entity") },
        },
      },
    ],
  },
  Me: {
    type: "object",
    properties: {
      id: uuid,
      name: string,
      email: string,
      organization: ref("Entity"),
      roles: { type: "array", items: string },
      permissions: { type: "array", items: string },
      development: { type: "boolean" },
    },
  },
  Report: {
    type: "object",
    properties: {
      period: ref("Entity"),
      rows: { type: "array", items: ref("Entity") },
      totals: obj({
        recorded: integer,
        submitted: integer,
        approved: integer,
        billable: integer,
        nonBillable: integer,
      }),
      projects: { type: "array", items: ref("Entity") },
      expectedPerEmployee: { type: ["integer", "null"] },
      projectScoped: { type: "boolean" },
    },
  },
};
const paths: Record<string, Record<string, unknown>> = {};
function add(
  method: string,
  path: string,
  summary: string,
  scope: string,
  requestSchema?: string,
  responseSchema = "Entity",
  options: {
    list?: boolean;
    page?: boolean;
    idempotent?: boolean;
    created?: boolean;
    csv?: boolean;
  } = {},
) {
  const parameters: unknown[] = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: uuid,
  }));
  if (options.page)
    parameters.push(
      {
        name: "page",
        in: "query",
        schema: { type: "integer", minimum: 1, default: 1 },
      },
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
    );
  if (method !== "get")
    parameters.push(
      { name: "X-CSRF-Token", in: "header", required: true, schema: string },
      {
        name: "Origin",
        in: "header",
        required: true,
        schema: { type: "string", format: "uri" },
      },
    );
  if (options.idempotent)
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", minLength: 8, maxLength: 128 },
    });
  if (path === "/reports/monthly")
    parameters.push({
      name: "periodId",
      in: "query",
      required: true,
      schema: uuid,
    });
  if (path === "/timesheets" && method === "get")
    parameters.push(
      ...["periodId", "status", "mine"].map((name) => ({
        name,
        in: "query",
        schema: name === "periodId" ? uuid : string,
      })),
    );
  if (path === "/employees" && method === "get")
    parameters.push({
      name: "search",
      in: "query",
      schema: { type: "string", maxLength: 100 },
    });
  if (path === "/audit-events")
    parameters.push({
      name: "targetId",
      in: "query",
      description: "Required for users without organization-wide audit scope",
      schema: uuid,
    });
  const responses: Record<string, unknown> = {};
  for (const code of [400, 401, 403, 404, 409, 422, 429, 500])
    responses[code] = {
      description: {
        400: "Malformed JSON",
        401: "No active valid session",
        403: "Permission, scope, origin or CSRF denied",
        404: "Record not found within authorized scope",
        409: "Stale revision, duplicate record, conflicting state or idempotency reuse",
        422: "Validation or configured business rule failed",
        429: "Request rate exceeded",
        500: "Safe internal error with correlation ID",
      }[code],
      content: { "application/json": { schema: ref("Error") } },
    };
  responses[options.created ? "201" : "200"] = {
    description: options.csv
      ? "Scoped CSV; formula-leading fields neutralized"
      : "Success; durations are integer minutes and calendar dates are ISO date values",
    content: options.csv
      ? { "text/csv": { schema: string } }
      : {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: options.list
                  ? { type: "array", items: ref(responseSchema) }
                  : ref(responseSchema),
                ...(options.page
                  ? {
                      meta: obj({
                        page: integer,
                        limit: integer,
                        total: integer,
                      }),
                    }
                  : {}),
              },
              required: ["data"],
            },
          },
        },
  };
  paths[path] ??= {};
  paths[path][method] = {
    summary,
    description:
      scope +
      (options.idempotent
        ? " Identical actor/key/payload replays return the stored result; changed payload/key reuse returns 409."
        : "") +
      (requestSchema === "Revision" ||
      requestSchema === "Decision" ||
      requestSchema === "ReplaceEntries"
        ? " Expected timesheet revision is mandatory; stale revision returns 409."
        : ""),
    security: [{ sessionCookie: [] }],
    parameters,
    ...(requestSchema
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref(requestSchema) } },
          },
        }
      : {}),
    responses,
  };
}
add(
  "get",
  "/me",
  "Current identity and permissions",
  "Active session; roles are resolved from the database.",
  undefined,
  "Me",
);
add(
  "get",
  "/reporting-periods",
  "Available company reporting periods",
  "Authenticated organization; newest 36 periods.",
  undefined,
  "Entity",
  { list: true },
);
add(
  "get",
  "/timesheets",
  "List authorized timesheets",
  "Own or timesheet.read grant within organization/team scope.",
  undefined,
  "TimesheetSummary",
  { list: true, page: true },
);
add(
  "post",
  "/timesheets",
  "Create or retrieve own monthly draft",
  "timesheet.write; employee ownership and company period enforced. Existing employee/period returns its existing draft.",
  "CreateTimesheet",
  "Entity",
  { created: true },
);
add(
  "get",
  "/timesheets/{id}",
  "Timesheet with versions and approval history",
  "Own or authorized employee scope. Project-only reviewers use their task review endpoint.",
  undefined,
  "TimesheetDetail",
);
add(
  "put",
  "/timesheets/{id}/entries",
  "Replace eligible draft entries",
  "timesheet.write; owner only, DRAFT only. Entries validated against period, project assignment, categories and daily limits.",
  "ReplaceEntries",
  "TimesheetDetail",
);
add(
  "post",
  "/timesheets/{id}/submit",
  "Submit monthly snapshot",
  "Owner; DRAFT; nonempty valid entries and resolvable non-self approvers. Snapshot, instance, tasks, audit and state are atomic.",
  "Revision",
  "Entity",
  { idempotent: true },
);
add(
  "post",
  "/timesheets/{id}/reopen",
  "Reopen returned or rejected timesheet",
  "Owner only; RETURNED or REJECTED. Prior snapshots/decisions remain unchanged.",
  "Revision",
);
add(
  "get",
  "/timesheets/{id}/amendments",
  "Amendment history",
  "Same scope as the parent timesheet.",
  undefined,
  "Entity",
  { list: true },
);
add(
  "post",
  "/timesheets/{id}/amendments",
  "Request approved-record correction",
  "Owner only; APPROVED; mandatory reason, expected revision, complete proposed entries and no existing open amendment.",
  "Amendment",
  "Entity",
  { created: true },
);
add(
  "get",
  "/approvals/inbox",
  "Assigned active approval tasks",
  "approval.decide; only assigned tasks in the current stage of active instances.",
  undefined,
  "Entity",
  { list: true, page: true },
);
add(
  "get",
  "/approvals/{taskId}",
  "Review submitted snapshot",
  "Assigned approver with current scoped authority; project tasks return only project-scoped entries. Amendment includes original approved entries.",
);
for (const action of ["approve", "reject", "return"])
  add(
    "post",
    `/approvals/{taskId}/${action}`,
    `${action} a review stage`,
    "Assigned active task and current stage; current permission scope; no self-approval. Reject/return require a nonempty reason. Amendment return is not permitted.",
    "Decision",
    "Entity",
    { idempotent: true },
  );
for (const action of ["approve", "reject"])
  add(
    "post",
    `/amendments/{id}/${action}`,
    `${action} active amendment task`,
    "Resolves the caller’s assigned active amendment task and applies the same stage/revision/authority checks as approvals.",
    "Decision",
    "Entity",
    { idempotent: true },
  );
add(
  "get",
  "/projects",
  "List assigned/managed or administered projects",
  "Company organization; own assignments/management, or explicit organization administration grant.",
  undefined,
  "Entity",
  { list: true },
);
add(
  "post",
  "/projects",
  "Create company project",
  "organization.write with organization scope; manager must belong to the organization.",
  "Project",
  "Entity",
  { created: true },
);
add(
  "post",
  "/project-assignments",
  "Create date-effective project assignment",
  "organization.write with organization scope. Both resources must belong to the company.",
  "Assignment",
  "Entity",
  { created: true },
);
add(
  "get",
  "/employees",
  "Scoped employee directory",
  "organization.read and explicit employee scope; case-insensitive name search.",
  undefined,
  "Entity",
  { list: true, page: true },
);
add(
  "post",
  "/employees",
  "Create employee",
  "organization.write with organization scope. Adds Employee/SELF role; does not grant approval rights.",
  "Employee",
  "Entity",
  { created: true },
);
add(
  "patch",
  "/employees/{id}",
  "Change active state or reporting manager",
  "organization.write with organization scope. No self-deactivation/self-manager. Deactivation invalidates sessions.",
  "EmployeeUpdate",
);
add(
  "get",
  "/organization/teams",
  "Scoped teams and memberships",
  "organization.read with organization or team scope.",
  undefined,
  "Entity",
  { list: true },
);
add(
  "post",
  "/organization/teams",
  "Create department/team",
  "organization.write with organization scope.",
  "Team",
  "Entity",
  { created: true },
);
add(
  "post",
  "/organization/teams/{id}/memberships",
  "Create effective team membership",
  "organization.write with organization scope. Employee and team must belong to the company.",
  "Membership",
  "Entity",
  { created: true },
);
add(
  "get",
  "/admin/configuration",
  "Read company configuration and role definitions",
  "configuration.write with organization scope.",
);
add(
  "get",
  "/admin/access-directory",
  "Minimal directory for access administration",
  "access.write; returns basic identity, team and project names, never employee work content.",
);
add(
  "patch",
  "/admin/identities/{id}",
  "Map immutable company identity",
  "access.write; organization and configured tenant checked; sessions revoked.",
  "Identity",
);
add(
  "post",
  "/admin/roles",
  "Grant a scoped role",
  "access.write; permitted role/scope combinations, company resources and audit enforced.",
  "Grant",
  "Entity",
  { created: true },
);
add(
  "post",
  "/admin/workflows",
  "Publish new active workflow version",
  "configuration.write with organization scope. Retains in-flight workflow references. ALL decision rule; delegation/escalation disabled.",
  "Workflow",
  "Entity",
  { created: true },
);
add(
  "post",
  "/admin/policies",
  "Create immutable policy version",
  "configuration.write with organization scope; existing periods retain their policy ID.",
  "CreatePolicy",
  "Entity",
  { created: true },
);
add(
  "post",
  "/admin/calendars",
  "Create calendar",
  "configuration.write with organization scope. Existing calendars have no ordinary update endpoint.",
  "Calendar",
  "Entity",
  { created: true },
);
add(
  "post",
  "/admin/reporting-periods",
  "Create complete reporting month",
  "configuration.write with organization scope; policy must belong to the company.",
  "Period",
  "Entity",
  { created: true },
);
add(
  "get",
  "/reports/monthly",
  "Monthly effort report",
  "report.read; explicit employee/project scope; one month, bounded to 1000 employees. Submitted and approved snapshots are separately calculated.",
  undefined,
  "Report",
);
add(
  "post",
  "/exports",
  "Export monthly CSV",
  "export.create plus report.read; same resource scope as monthly reports; synchronous bounded export with an audit record.",
  "CreateTimesheet",
  "Entity",
  { csv: true },
);
add(
  "get",
  "/audit-events",
  "Read immutable audit history",
  "audit.read; organization-scoped grant or an authorized target timesheet. No mutation endpoints.",
  undefined,
  "Entity",
  { list: true, page: true },
);
add(
  "get",
  "/notifications",
  "Recent in-app notifications",
  "Own notifications only; newest 100.",
  undefined,
  "Entity",
  { list: true },
);
add(
  "post",
  "/notifications/{id}/read",
  "Mark own notification read",
  "Notification owner only. Unknown/non-owned ID has no effect.",
);
add('get','/employee-options','Scoped employee options','organization.read; basic company directory fields, bounded to 1000 employees.',undefined,'Entity',{list:true});
add('post','/admin/identities','Provision employee identity','access.write; creates Employee/SELF only, with optional paired immutable Entra IDs.','Employee','Entity',{created:true});
add('delete','/admin/roles/{id}','Revoke scoped role','access.write; company scope; last active system administrator is protected.');
const doc = {
  openapi: "3.1.0",
  info: {
    title: "MultiverseTech Solutions Timesheet API",
    version: "0.1.0",
    description:
      "Incremental implementation contract. Authentication endpoints live at /auth; see docs/entra-sso.md. Error responses never include stack traces. Placeholder Entity responses are extensible domain objects; Prisma schema and API regression tests define their additional fields.",
  },
  servers: [{ url: "/api/v1" }],
  paths,
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "mv_session" },
    },
    schemas,
  },
};
writeFileSync("docs/openapi.json", JSON.stringify(doc, null, 2) + "\n");
console.log(`Generated ${Object.keys(paths).length} API paths`);
