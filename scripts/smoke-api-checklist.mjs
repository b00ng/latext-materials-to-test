#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes('--help')) {
  printUsage();
  process.exit(0);
}

const baseUrlInput = getArgValue('--base-url') ?? process.env.SMOKE_BASE_URL;
const apiKey = getArgValue('--api-key') ?? process.env.SMOKE_API_KEY;

if (!baseUrlInput || !apiKey) {
  console.error('Missing required arguments.');
  printUsage();
  process.exit(1);
}

const baseUrl = normalizeBaseUrl(baseUrlInput);
const headers = { 'x-api-key': apiKey };
const timeoutMs = Number.parseInt(getArgValue('--timeout-ms') ?? process.env.SMOKE_TIMEOUT_MS ?? '90000', 10);
const startAt = Date.now();

main().catch((error) => {
  console.error(`\nSmoke checklist failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

async function main() {
  console.log(`Smoke checklist target: ${baseUrl}`);
  console.log('1) Health check');
  const health = await fetchJson('/health');
  assertStatus(health.status, [200], 'Health check failed');
  assert(health.body?.status === 'ok', 'Health response does not include status=ok');

  console.log('2) Upload sample material');
  const materialId = `mat-smoke-${Date.now()}`;
  const uploadForm = new FormData();
  uploadForm.append('materialId', materialId);
  uploadForm.append('sourceType', 'latex');
  uploadForm.append('mainFile', 'main.tex');
  uploadForm.append('title', 'Smoke Checklist');
  uploadForm.append('files[]', new Blob(['\\begin{enumerate}\\item 1+1=2\\end{enumerate}']), 'main.tex');

  const upload = await fetchJson('/api/materials/upload', {
    method: 'POST',
    headers,
    body: uploadForm
  });
  assertStatus(upload.status, [202], 'Upload failed');
  const jobId = upload.body?.jobId;
  assert(typeof jobId === 'string' && jobId.length > 0, 'Upload response missing jobId');

  console.log('3) Poll canonical job status');
  const job = await poll(async () => {
    const response = await fetchJson(`/api/jobs/${jobId}`, { headers });
    assertStatus(response.status, [200], 'Job status endpoint failed');
    const status = response.body?.job?.status;
    if (status === 'failed') {
      const message = response.body?.job?.errorMessage ?? 'unknown extraction error';
      throw new Error(`Job failed: ${message}`);
    }
    if (status === 'completed') {
      return response.body;
    }
    return null;
  }, timeoutMs);
  assert(job?.job?.status === 'completed', 'Job did not reach completed status');

  console.log('4) Fetch extracted questions');
  const questionsPayload = await poll(async () => {
    const response = await fetchJson(`/api/materials/${materialId}/questions`, { headers });
    assertStatus(response.status, [200], 'Questions endpoint failed');
    if (Number(response.body?.count ?? 0) > 0) {
      return response.body;
    }
    return null;
  }, timeoutMs);

  const firstQuestion = questionsPayload?.questions?.[0];
  assert(firstQuestion, 'No extracted questions were returned');

  console.log('5) Generate test sheet');
  const generatePayload = {
    title: 'Smoke Generated Test',
    questionCount: 1,
    materialIds: [materialId]
  };
  if (typeof firstQuestion.topic === 'string' && firstQuestion.topic.length > 0) {
    generatePayload.topics = [firstQuestion.topic];
  }

  const generated = await fetchJson('/api/tests/generate', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(generatePayload)
  });
  assertStatus(generated.status, [201], 'Test generation failed');
  const testId = generated.body?.test?.id;
  assert(typeof testId === 'string' && testId.length > 0, 'Generate response missing test id');

  console.log('6) Validate generated test');
  const test = await fetchJson(`/api/tests/${testId}`, { headers });
  assertStatus(test.status, [200], 'Get test failed');
  assert(Number(test.body?.questions?.length ?? 0) >= 1, 'Generated test has no questions');

  console.log('7) Validate legacy job status path policy');
  const legacy = await fetchJson(`/api/extraction/jobs/${jobId}`, { headers });
  assertStatus(legacy.status, [404], 'Legacy /api/extraction/jobs/:id path should return 404');

  const seconds = ((Date.now() - startAt) / 1000).toFixed(1);
  console.log(`\nSmoke checklist passed in ${seconds}s`);
}

async function poll(check, timeout) {
  const intervalMs = 2000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Polling timed out after ${timeout}ms`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: response.status, body };
}

function assertStatus(actual, expected, message) {
  if (expected.includes(actual)) {
    return;
  }
  throw new Error(`${message}: expected [${expected.join(', ')}], got ${actual}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getArgValue(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  if (index >= 0) {
    return args[index + 1];
  }
  return null;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function printUsage() {
  console.error(`Usage:
  npm run smoke:api -- --base-url https://mcq-generator.<subdomain>.workers.dev --api-key <api-key>

or with env vars:
  SMOKE_BASE_URL=https://mcq-generator.<subdomain>.workers.dev SMOKE_API_KEY=<api-key> npm run smoke:api

Optional:
  --timeout-ms <number> (default: 90000)`);
}
