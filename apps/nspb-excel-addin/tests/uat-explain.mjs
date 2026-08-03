// UAT harness — EXPLAIN MODE (FAQ / how-to questions, no tenant calls).
// Posts a list of questions to /api/chat with forceExplain:true, captures the
// reply, and runs assertions: did it stay in prose, did it include CHIP: lines,
// did it stay in English, did it avoid mentioning specific add-in internals.
//
// Run:  node tests/uat-explain.mjs
// Output: tests/uat-explain-report.json + console summary.

const API = "https://gentle-moon-046f.nspbassistant.workers.dev/api/chat";
const SETTINGS = {
  host: "https://nspb-amedel012015.epm.ca-montreal-1.ocs.oraclecloud.com",
  username: "demo@example.com",
  password: "(not used in explain mode)",
  appName: "NetSuite",
  geminiKey: "AIzaSyDkHHXV7L_Y-elF0aG-VX0wI475yASh3zE",
};

// 15 FAQ-style questions a user might click "Try it" on.
const TESTS = [
  { q: "What is a substitution variable in NSPB?",        expect: ["substitution"] },
  { q: "How do I run a business rule in NSPB?",            expect: ["business rule", "run"] },
  { q: "What is a smart push in NSPB?",                    expect: ["smart push"] },
  { q: "What is a valid intersection in NSPB?",            expect: ["valid intersection"] },
  { q: "How do I copy data between scenarios in NSPB?",    expect: ["scenario"] },
  { q: "When should I update CurrentMonth?",               expect: ["currentmonth", "month"] },
  { q: "How do I do month-end close in NSPB?",             expect: ["close", "month"] },
  { q: "How do I add a new GL account to NSPB?",           expect: ["account"] },
  { q: "How do I diagnose a failed nightly integration?",  expect: ["integration"] },
  { q: "What is an alternate hierarchy in NSPB?",          expect: ["alternate hierarchy", "hierarchy"] },
  { q: "How do I reconcile NetSuite vs NSPB?",             expect: ["reconcile", "netsuite"] },
  { q: "How does the workforce push work in NSPB?",        expect: ["workforce"] },
  { q: "How do I add new users and assign roles in NSPB?", expect: ["user", "role"] },
  { q: "How do I import data from NetSuite into NSPB?",    expect: ["import", "netsuite"] },
  { q: "What is the difference between input and review forms?", expect: ["input", "review"] },
];

async function callChat(question, attempt = 1) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
      settings: SETTINGS,
      forceExplain: true,
    }),
  });
  const data = await resp.json();
  // Retry transient Gemini 503/429. Up to 3 attempts with backoff.
  const transient = data && data.error && /\b(503|429|UNAVAILABLE|RATE)/i.test(data.error);
  if (transient && attempt < 3) {
    await new Promise(r => setTimeout(r, 2500 * attempt));
    return callChat(question, attempt + 1);
  }
  return { status: resp.status, data, attempts: attempt };
}

function looksEnglish(s) {
  // Cheap heuristic: ratio of common English words. Catches obvious Spanish
  // regressions ("usted", "configuración", "cómo", etc.).
  const text = String(s || "").toLowerCase();
  const en = (text.match(/\b(the|and|you|to|of|in|is|are|use|when|how|with|for)\b/g) || []).length;
  const es = (text.match(/\b(el|la|los|las|usted|cómo|cuándo|configuración|reglas|usuario)\b/g) || []).length;
  return en > 5 && en > es * 2;
}

function countChipLines(s) {
  return (String(s || "").match(/^\s*CHIP:/gm) || []).length;
}

function hasToolExecution(s) {
  // Indicators that a tool actually ran instead of an explanation.
  const text = String(s || "");
  if (/✓\s+Grid written to/i.test(text)) return true;
  if (/\bsheet\s+`?[A-Z][\w_]+`?\s+(was\s+)?written/i.test(text)) return true;
  return false;
}

function assertions(reply) {
  const a = {};
  a.hasReply = !!reply && reply.length > 50;
  a.english = looksEnglish(reply);
  a.chipLines = countChipLines(reply);
  a.hasChips = a.chipLines >= 2;
  a.noToolExec = !hasToolExecution(reply);
  return a;
}

function expectsHit(reply, expectArr) {
  const t = String(reply || "").toLowerCase();
  return expectArr.every(e => t.includes(e.toLowerCase()));
}

(async () => {
  const results = [];
  let i = 0;
  for (const t of TESTS) {
    i++;
    process.stdout.write(`[${i}/${TESTS.length}] ${t.q.slice(0, 60)}…  `);
    const t0 = Date.now();
    let row;
    try {
      const { status, data } = await callChat(t.q);
      const reply = data && data.reply || "";
      const a = assertions(reply);
      const expectsOk = expectsHit(reply, t.expect);
      const pass = a.hasReply && a.english && a.hasChips && a.noToolExec && expectsOk;
      row = { q: t.q, status, ms: Date.now() - t0, pass, asserts: a, expectsOk, replyPreview: reply.slice(0, 400), serverError: data && data.error || null };
      console.log(pass ? "PASS" : "FAIL", `(chips:${a.chipLines}, en:${a.english ? "y" : "n"}, tool:${a.noToolExec ? "n" : "y"}, expects:${expectsOk ? "y" : "n"}, ${row.ms}ms)`);
    } catch (e) {
      row = { q: t.q, ms: Date.now() - t0, pass: false, error: String(e.message || e) };
      console.log("ERROR", e.message || e);
    }
    results.push(row);
  }
  const passed = results.filter(r => r.pass).length;
  console.log(`\n=== ${passed}/${results.length} passed ===\n`);

  // Print first failure detail
  const firstFail = results.find(r => !r.pass);
  if (firstFail) {
    console.log("First failure detail:\n", JSON.stringify(firstFail, null, 2));
  }

  // Write JSON report
  const fs = await import("node:fs");
  const path = await import("node:path");
  const out = path.join(process.cwd(), "tests", "uat-explain-report.json");
  fs.writeFileSync(out, JSON.stringify({ ts: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log("Report:", out);
  process.exit(passed === results.length ? 0 : 1);
})();
