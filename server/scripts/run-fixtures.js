// Step 27: backend regression script. Posts every fixture to /api/analyze and prints an
// expected-vs-actual table. Exit code 1 if any Safe or Malicious fixture does not match
// (Suspicious results from an LLM may vary, so they are reported but never fail the run).
// Usage (from /server, with the server running): node scripts\run-fixtures.js [baseUrl]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const baseUrl = process.argv[2] || `http://localhost:${process.env.PORT || 5000}`;
const fixturesPath = fileURLToPath(new URL('../../mock/fixtures/messages.json', import.meta.url));
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));

const rows = [];
let strictFailures = 0;

for (const fixture of fixtures) {
  let actual = 'ERROR';
  try {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fixture.text }),
    });
    const data = await res.json();
    actual = data.verdict ?? `HTTP ${res.status}`;
  } catch (err) {
    actual = `ERROR: ${err.message}`;
  }
  const match = actual === fixture.expected;
  const strict = fixture.expected === 'Safe' || fixture.expected === 'Malicious';
  if (strict && !match) strictFailures += 1;
  rows.push({
    id: fixture.id,
    expected: fixture.expected,
    actual,
    result: match ? 'PASS' : strict ? 'FAIL' : 'DIFF (non-strict)',
  });
}

console.table(rows);
console.log(strictFailures === 0 ? 'All Safe and Malicious fixtures match.' : `${strictFailures} Safe/Malicious fixture(s) FAILED.`);
process.exit(strictFailures === 0 ? 0 : 1);
