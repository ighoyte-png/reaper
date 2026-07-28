/**
 * Lightweight security regression checks (no test runner required).
 * Run: npx --yes tsx scripts/security-selfcheck.ts
 */
import { sanitizeNotesHtml, notesHasContent } from "../src/lib/notes-html";
import { sanitizeExternalUrl } from "../src/lib/safe-url";
import { sanitizePublicWorkspace } from "../src/lib/share/sanitize";
import { generateShareToken } from "../src/lib/share/token";
import { createDemoSeed } from "../src/lib/demo/seed";
import type { DemoState } from "../src/lib/types";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function testNotesSanitize() {
  assert(sanitizeNotesHtml("") === "", "empty notes");
  assert(
    !sanitizeNotesHtml(`<img src=x onerror=alert(1)>`).includes("onerror"),
    "strip event handlers / unknown tags",
  );
  assert(
    !sanitizeNotesHtml(`<script>alert(1)</script>`).includes("<script"),
    "strip script tags",
  );
  const link = sanitizeNotesHtml(
    `<a href="javascript:alert(1)">x</a><a href="https://example.com">ok</a>`,
  );
  assert(!link.includes("javascript:"), "block javascript: href");
  assert(link.includes("https://example.com"), "allow https href");
  assert(notesHasContent("<p>hi</p>"), "has content");
}

function testSafeUrl() {
  assert(sanitizeExternalUrl("https://ok.example/a")?.startsWith("https://"), "https ok");
  assert(sanitizeExternalUrl("javascript:alert(1)") === null, "reject javascript");
  assert(sanitizeExternalUrl("data:text/html,hi") === null, "reject data");
  assert(sanitizeExternalUrl("example.com/path")?.startsWith("https://"), "prefix https");
}

function testShareSanitize() {
  const seed = createDemoSeed() as DemoState;
  seed.clients = seed.clients.map((c, i) =>
    i === 0
      ? {
          ...c,
          contact_email: "secret@client.com",
          contact_phone: "555-0100",
          contact_first_name: "Pat",
          contact_last_name: "Lee",
          notes: "internal client note",
        }
      : c,
  );
  seed.tasks = seed.tasks.map((t, i) =>
    i === 0 ? { ...t, notes: "<p>secret task plan</p>" } : t,
  );
  seed.projects = seed.projects.map((p, i) =>
    i === 0 ? { ...p, notes: "internal project note" } : p,
  );
  seed.leave_days = [
    {
      id: "leave-1",
      organization_id: seed.organization.id,
      person_id: seed.people[0]?.id ?? "p1",
      date: "2026-01-01",
      kind: "vacation",
      status: "approved",
      hours_per_day: null,
      notes: "",
    },
  ];
  seed.bulletins = [
    {
      id: "b-all",
      organization_id: seed.organization.id,
      project_id: null,
      title: "Public",
      body: "hi",
      pinned: false,
      audience: "all",
      audience_person_ids: [],
      audience_pod_ids: [],
      created_by_profile_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "b-private",
      organization_id: seed.organization.id,
      project_id: null,
      title: "Staff only",
      body: "secret",
      pinned: false,
      audience: "people",
      audience_person_ids: [seed.people[0]?.id ?? "p1"],
      audience_pod_ids: [],
      created_by_profile_id: null,
      created_at: new Date().toISOString(),
    },
  ];
  seed.project_assets = seed.project_assets.map((a, i) =>
    i === 0 ? { ...a, hide_from_client: true, url: "javascript:alert(1)" } : a,
  );
  seed.project_templates = [
    {
      id: "tmpl-1",
      organization_id: seed.organization.id,
      name: "Internal playbook",
      description: "do not share",
    },
  ];

  const out = sanitizePublicWorkspace(seed);
  assert(
    out.clients.every((c) => !c.contact_email && !c.contact_phone && !c.notes),
    "strip client PII/notes",
  );
  assert(out.tasks.every((t) => t.notes === ""), "strip task notes");
  assert(out.projects.every((p) => p.notes === ""), "strip project notes");
  assert(out.leave_days.length === 0, "omit leave");
  assert(
    out.bulletins.every((b) => b.audience === "all"),
    "only public bulletins",
  );
  assert(
    !out.project_assets.some((a) => a.hide_from_client),
    "omit hide_from_client assets",
  );
  assert(out.project_templates.length === 0, "omit templates");
  assert(out.people.every((p) => !p.email && p.cost_rate === 0), "strip people rates/email");
}

function testToken() {
  const a = generateShareToken();
  const b = generateShareToken();
  assert(a.length >= 32, "token length");
  assert(a !== b, "tokens unique");
  assert(/^[0-9a-f]+$/.test(a), "hex token");
}

testNotesSanitize();
testSafeUrl();
testShareSanitize();
testToken();
console.log("security-selfcheck: ok");
