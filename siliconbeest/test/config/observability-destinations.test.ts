import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

type JsonObject = Record<string, unknown>;

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, '../../..');
const fixtureRoots = new Set<string>();

afterEach(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  fixtureRoots.clear();
});

type ConfigFixture = {
  root: string;
  script: string;
  mainDir: string;
  consumerDir: string;
  emailDir: string;
};

function createFixture(): ConfigFixture {
  const root = mkdtempSync(join(tmpdir(), 'siliconbeest-observability-config-'));
  fixtureRoots.add(root);
  const scriptsDir = join(root, 'scripts');
  const mainDir = join(root, 'siliconbeest');
  const consumerDir = join(root, 'siliconbeest-queue-consumer');
  const emailDir = join(root, 'siliconbeest-email-sender');

  for (const directory of [scriptsDir, mainDir, consumerDir, emailDir]) {
    mkdirSync(directory, { recursive: true });
  }

  cpSync(join(REPOSITORY_ROOT, 'scripts/config.sh'), join(scriptsDir, 'config.sh'));
  cpSync(
    join(REPOSITORY_ROOT, 'scripts/sync-config.sh'),
    join(scriptsDir, 'sync-config.sh'),
  );

  return {
    root,
    script: join(scriptsDir, 'sync-config.sh'),
    mainDir,
    consumerDir,
    emailDir,
  };
}

function fixtureEnvironment(
  fixture: ConfigFixture,
  logsDestinations?: string,
  tracesDestinations?: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PROJECT_ROOT: fixture.root,
    MAIN_DIR: fixture.mainDir,
    CONSUMER_DIR: fixture.consumerDir,
    EMAIL_DIR: fixture.emailDir,
    PROJECT_PREFIX: 'test-instance',
    INSTANCE_DOMAIN: 'social.test.example',
    INSTANCE_TITLE: 'Observability Config Test',
    REPOSITORY_URL: 'https://example.com/test/siliconbeest',
    REGISTRATION_MODE: 'closed',
    SKIP_SIGNATURE_VERIFICATION: 'false',
    D1_DATABASE_ID: '00000000-0000-0000-0000-000000000001',
    KV_CACHE_ID: 'cache-test-id',
    KV_SESSIONS_ID: 'sessions-test-id',
    KV_FEDIFY_ID: 'fedify-test-id',
  };

  if (logsDestinations === undefined) {
    delete environment.OBSERVABILITY_LOGS_DESTINATIONS;
  } else {
    environment.OBSERVABILITY_LOGS_DESTINATIONS = logsDestinations;
  }

  if (tracesDestinations === undefined) {
    delete environment.OBSERVABILITY_TRACES_DESTINATIONS;
  } else {
    environment.OBSERVABILITY_TRACES_DESTINATIONS = tracesDestinations;
  }

  return environment;
}

function runGenerator(
  fixture: ConfigFixture,
  logsDestinations?: string,
  tracesDestinations?: string,
): void {
  execFileSync('/bin/bash', [fixture.script, '--apply'], {
    cwd: fixture.root,
    env: fixtureEnvironment(fixture, logsDestinations, tracesDestinations),
    stdio: 'pipe',
  });
}

function readJsonc(path: string): JsonObject {
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (parsed.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'),
    );
  }
  return parsed.config as JsonObject;
}

function observability(config: JsonObject): JsonObject {
  const value = config.observability;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('generated config has no observability object');
  }
  return value as JsonObject;
}

describe('Workers Observability destination drains', () => {
  it('emits no destinations when the variables are unset', () => {
    const fixture = createFixture();
    runGenerator(fixture);

    const main = observability(readJsonc(join(fixture.mainDir, 'wrangler.jsonc')));
    expect(main.logs).not.toHaveProperty('destinations');
    expect(main.traces).not.toHaveProperty('destinations');
  });

  it('adds destinations to the main worker logs and traces blocks when set', () => {
    const fixture = createFixture();
    runGenerator(fixture, 'sentry-logs', 'sentry-traces');

    const main = observability(readJsonc(join(fixture.mainDir, 'wrangler.jsonc')));
    expect(main.logs).toMatchObject({
      enabled: true,
      destinations: ['sentry-logs'],
    });
    expect(main.traces).toMatchObject({
      enabled: true,
      destinations: ['sentry-traces'],
    });

    const consumer = observability(
      readJsonc(join(fixture.consumerDir, 'wrangler.jsonc')),
    );
    const email = observability(readJsonc(join(fixture.emailDir, 'wrangler.jsonc')));
    expect(consumer).toEqual({ enabled: true });
    expect(email).toEqual({ enabled: true });
  });

  it('supports comma-separated destination lists and trims whitespace', () => {
    const fixture = createFixture();
    runGenerator(fixture, ' sentry-logs , axiom_logs ', 'sentry-traces');

    const main = observability(readJsonc(join(fixture.mainDir, 'wrangler.jsonc')));
    expect(main.logs).toMatchObject({
      destinations: ['sentry-logs', 'axiom_logs'],
    });
  });

  it('rejects destination names that could break the generated JSON', () => {
    const fixture = createFixture();
    expect(() => runGenerator(fixture, 'bad"name')).toThrow();
    expect(() => runGenerator(fixture, undefined, 'bad name')).toThrow();
  });
});
