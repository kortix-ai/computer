#!/usr/bin/env bun
/**
 * Manual test for session pruning.
 *
 * Usage:
 *   bun run src/__tests__/manual-test-pruning.ts [--url http://localhost:8008]
 *
 * What it does:
 *   1. Sends a /chat/completions request with large tool results + session_id
 *   2. Sends a second request immediately (within TTL) — no pruning expected
 *   3. Waits for TTL to expire (configurable, default 10s for testing)
 *   4. Sends a third request — pruning should fire, visible in router logs
 *
 * Prerequisites:
 *   - kortix-api running (bun run --hot src/index.ts)
 *   - Set SESSION_PRUNING_TTL_MS=10000 for fast testing (10s instead of 5min)
 *   - Set OPENROUTER_API_KEY (or expect 401 from upstream — pruning still logs)
 *
 * Watch the router console for:
 *   [LLM][Pruning] session=test-prune...: soft-trimmed=N, hard-cleared=N, chars-saved=N
 */

const BASE_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:8008';

const SESSION_ID = `test-pruning-${Date.now()}`;
const TTL_WAIT = parseInt(process.env.SESSION_PRUNING_TTL_MS || '10000', 10);

function makeLargeToolContent(chars: number): string {
  const lines: string[] = [];
  let total = 0;
  let i = 0;
  while (total < chars) {
    const line = `line-${i++}: ${'x'.repeat(80)}\n`;
    lines.push(line);
    total += line.length;
  }
  return lines.join('').slice(0, chars);
}

function buildRequest(numToolResults: number, contentSize: number) {
  const messages: any[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Run some commands for me.' },
  ];

  // Add tool call rounds (old, prunable)
  for (let i = 0; i < numToolResults; i++) {
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: `call_old_${i}`,
          type: 'function',
          function: {
            name: 'bash',
            arguments: JSON.stringify({ cmd: `ls -la /round-${i}` }),
          },
        },
      ],
    });
    messages.push({
      role: 'tool',
      tool_call_id: `call_old_${i}`,
      content: makeLargeToolContent(contentSize),
    });
  }

  // Add 3 recent assistant turns (protected)
  for (let i = 0; i < 3; i++) {
    messages.push({ role: 'user', content: `Question ${i + 1}?` });
    messages.push({
      role: 'assistant',
      content: `Answer ${i + 1}. This is a recent turn that should be protected.`,
    });
  }

  // Final user message
  messages.push({ role: 'user', content: 'What did the old commands show?' });

  return {
    model: 'kortix/basic',
    messages,
    session_id: SESSION_ID,
    stream: false,
    max_tokens: 10, // minimal — we're testing pruning, not LLM output
  };
}

async function sendRequest(label: string, body: any) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${label}`);
  console.log(`${'─'.repeat(60)}`);

  const msgCount = body.messages.length;
  const totalChars = body.messages.reduce(
    (sum: number, m: any) =>
      sum + (typeof m.content === 'string' ? m.content.length : 0),
    0,
  );
  const toolMsgs = body.messages.filter((m: any) => m.role === 'tool').length;

  console.log(`  Messages: ${msgCount} (${toolMsgs} tool results)`);
  console.log(`  Total content chars: ${totalChars.toLocaleString()}`);
  console.log(`  Session: ${SESSION_ID}`);

  try {
    const res = await fetch(`${BASE_URL}/v1/router/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(body),
    });

    console.log(`  Response: ${res.status} ${res.statusText}`);

    if (res.status === 401 || res.status === 403) {
      console.log('  (Auth error — expected if no valid token. Check router logs for pruning output.)');
    } else if (!res.ok) {
      const text = await res.text();
      console.log(`  Error: ${text.slice(0, 200)}`);
    } else {
      console.log('  Success!');
    }
  } catch (err: any) {
    console.log(`  Connection error: ${err.message}`);
    console.log(`  Is kortix-api running at ${BASE_URL}?`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        Session Pruning Manual Test                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`TTL wait: ${TTL_WAIT}ms`);
  console.log(`Session: ${SESSION_ID}`);

  const body = buildRequest(8, 20_000); // 8 tool results × 20K chars = 160K

  // Request 1: First request for this session — establishes TTL baseline
  await sendRequest('REQUEST 1: First request (establishes session)', body);
  console.log('\n  → Check router logs: should see NO pruning log');

  // Request 2: Immediate follow-up — within TTL, no pruning
  await sendRequest('REQUEST 2: Immediate follow-up (within TTL)', body);
  console.log('\n  → Check router logs: should see NO pruning log');

  // Wait for TTL to expire
  const waitSec = Math.ceil(TTL_WAIT / 1000) + 1;
  console.log(`\n⏳ Waiting ${waitSec}s for TTL to expire...`);
  await new Promise((resolve) => setTimeout(resolve, TTL_WAIT + 1000));

  // Request 3: After TTL — pruning should fire
  await sendRequest('REQUEST 3: After TTL expiry (pruning expected!)', body);
  console.log('\n  → Check router logs: should see [LLM][Pruning] log!');

  console.log('\n✅ Done. Review the kortix-api console output for pruning logs.');
}

main().catch(console.error);
