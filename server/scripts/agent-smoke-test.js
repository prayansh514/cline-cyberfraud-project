// Step 19/20: standalone smoke test for the Cline SDK agent.
// Creates one stateless agent, runs one prompt, streams the text deltas and prints the final reply.
// /api/analyze uses the final result text (result.outputText); deltas are only printed here to
// prove streaming works and that the concatenated deltas match the final text.
// Usage (from /server): node scripts\agent-smoke-test.js
import 'dotenv/config';
import { Agent } from '@cline/sdk';

const { CLINE_PROVIDER_ID, CLINE_MODEL_ID, CLINE_API_KEY } = process.env;

const missing = Object.entries({ CLINE_PROVIDER_ID, CLINE_MODEL_ID, CLINE_API_KEY })
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.error(`Missing required settings in server/.env: ${missing.join(', ')}`);
  console.error('Fill them in (see .env.example) and run this script again.');
  process.exit(2);
}

const agent = new Agent({
  providerId: CLINE_PROVIDER_ID,
  modelId: CLINE_MODEL_ID,
  apiKey: CLINE_API_KEY,
  systemPrompt: 'You are a test assistant. Follow the user instruction exactly.',
  maxIterations: 1,
});

let streamed = '';
agent.subscribe((event) => {
  if (event.type === 'assistant-text-delta') {
    streamed += event.text ?? '';
    process.stdout.write(event.text ?? '');
  }
});

try {
  const result = await agent.run('Reply with the single word: pong');
  process.stdout.write('\n');
  // agent.run() resolves (it does not throw) when the provider call fails, so check the status.
  if (result.status !== 'completed') {
    console.error(`Agent run ${result.status}: ${result.error?.message ?? 'no output returned'}`);
    process.exit(1);
  }
  console.log(`Agent reply: ${result.outputText}`);
  console.log(`Deltas match final text: ${streamed.trim() === result.outputText.trim()}`);
} catch (err) {
  console.error(`Agent call failed: ${err.message}`);
  process.exit(1);
}

