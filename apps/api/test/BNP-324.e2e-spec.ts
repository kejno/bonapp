import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isPostgresPortConflict } from '../src/local-development-compose';

const repositoryRoot = resolve(__dirname, '../../..');
const COMPOSE_TIMEOUT = 120_000;
// compose up --wait (120s) + migration (60s) + API startup (30s) + buffer
const API_STARTUP_TIMEOUT = 300_000;
const databaseUrl = 'postgresql://postgres:postgres@localhost:5432/bonapp';

const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: COMPOSE_TIMEOUT,
  });

interface ServiceStatus {
  Service: string;
  Health: string;
}

function parseServiceStatuses(raw: string): ServiceStatus[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as ServiceStatus[];
  }
  return trimmed
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ServiceStatus);
}

describe('BNP-324: API local environment template', () => {
  const envPath = resolve(repositoryRoot, 'apps/api/.env');
  const envExamplePath = resolve(repositoryRoot, 'apps/api/.env.example');
  const temporarySchemas: string[] = [];
  let envCreatedByTest = false;

  beforeAll(() => {
    if (!existsSync(envPath)) {
      const envContent = readFileSync(envExamplePath, 'utf8')
        .replace(
          'replace-with-a-long-random-secret',
          'test-jwt-secret-bnp324-automation-value',
        )
        .replace(
          'replace-with-a-different-long-random-secret',
          'test-jwt-refresh-secret-bnp324-automation-value',
        );
      writeFileSync(envPath, envContent);
      envCreatedByTest = true;
    }
  });

  afterAll(() => {
    if (envCreatedByTest && existsSync(envPath)) {
      unlinkSync(envPath);
    }
    for (const schema of temporarySchemas) {
      try {
        execFileSync(
          'npx',
          ['prisma', 'db', 'execute', '--stdin', '--url', databaseUrl],
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
            input: `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`,
            stdio: 'pipe',
            timeout: 60_000,
          },
        );
      } catch {
        // Cleanup must not hide the assertion result.
      }
    }
    try {
      compose('down');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it(
    'creates .env from template with non-empty JWT secrets and starts API without PostgreSQL/Redis connection errors',
    async () => {
      // Verify .env.example provides all required fields with correct placeholders.
      const envExample = readFileSync(envExamplePath, 'utf8');
      expect(envExample).toContain(
        'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp',
      );
      expect(envExample).toContain('REDIS_URL=redis://localhost:6379');
      expect(envExample).toContain(
        'JWT_SECRET=replace-with-a-long-random-secret',
      );
      expect(envExample).toContain(
        'JWT_REFRESH_SECRET=replace-with-a-different-long-random-secret',
      );
      expect(envExample).toContain(
        'PAYMENT_PUBLIC_KEY=replace-with-payment-public-key',
      );
      expect(envExample).toContain(
        'PAYMENT_SECRET_KEY=replace-with-payment-secret-key',
      );

      // Verify the created .env has non-empty, non-placeholder JWT secrets.
      const envContent = readFileSync(envPath, 'utf8');
      expect(envContent).toMatch(/^JWT_SECRET=.+$/m);
      expect(envContent).not.toContain(
        'JWT_SECRET=replace-with-a-long-random-secret',
      );
      expect(envContent).toMatch(/^JWT_REFRESH_SECRET=.+$/m);
      expect(envContent).not.toContain(
        'JWT_REFRESH_SECRET=replace-with-a-different-long-random-secret',
      );

      // Start only the services required for the API (postgres, redis).
      // If postgres port 5432 is already bound by a host service (e.g. a
      // GitHub Actions service container), compose up fails for postgres while
      // redis may have started successfully. In that case start redis
      // independently and verify postgres reachability via TCP.
      try {
        compose('up', '-d', 'postgres', 'redis', '--wait');
      } catch (error) {
        if (!isPostgresPortConflict(error)) {
          throw error;
        }
        compose('up', '-d', 'redis', '--wait');
      }

      const statuses = parseServiceStatuses(compose('ps', '--format', 'json'));
      const redis = statuses.find((s) => s.Service === 'redis');
      const postgresReachable = (() => {
        try {
          execFileSync('nc', ['-z', '-w', '5', 'localhost', '5432'], {
            stdio: 'pipe',
            timeout: 6_000,
          });
          return true;
        } catch {
          return false;
        }
      })();
      expect(postgresReachable).toBe(true);
      expect(redis?.Health).toBe('healthy');

      // A database that was previously baselined with only the later migration
      // must accept the newly added initial migration without recreating tables.
      const legacySchema = `bnp332_${randomUUID().replaceAll('-', '')}`;
      const legacyDatabaseUrl = `${databaseUrl}?schema=${legacySchema}`;
      const logoMigrationChecksum = createHash('sha256')
        .update(
          readFileSync(
            resolve(
              repositoryRoot,
              'apps/api/prisma/migrations/20260917000000_add_tenant_logo_url/migration.sql',
            ),
          ),
        )
        .digest('hex');
      const executeSql = (url: string, sql: string) =>
        execFileSync(
          'npx',
          ['prisma', 'db', 'execute', '--stdin', '--url', url],
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
            input: sql,
            stdio: 'pipe',
            timeout: 60_000,
          },
        );

      try {
        executeSql(databaseUrl, `CREATE SCHEMA "${legacySchema}";`);
        executeSql(
          legacyDatabaseUrl,
          `
            CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "logoUrl" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "email" TEXT NOT NULL, "role" TEXT NOT NULL, CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
            CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
            CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
            CREATE TABLE "_prisma_migrations" (
              "id" VARCHAR(36) PRIMARY KEY,
              "checksum" VARCHAR(64) NOT NULL,
              "finished_at" TIMESTAMPTZ,
              "migration_name" VARCHAR(255) NOT NULL,
              "logs" TEXT,
              "rolled_back_at" TIMESTAMPTZ,
              "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
              "applied_steps_count" INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('${randomUUID()}', '${logoMigrationChecksum}', now(), '20260917000000_add_tenant_logo_url', 1);
          `,
        );

        const legacyMigrationOutput = execFileSync(
          'npx',
          [
            'prisma',
            'migrate',
            'deploy',
            '--schema',
            'apps/api/prisma/schema.prisma',
          ],
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 60_000,
            env: { ...process.env, DATABASE_URL: legacyDatabaseUrl },
          },
        );
        expect(legacyMigrationOutput).toContain('20260916000000_init');
      } finally {
        executeSql(
          databaseUrl,
          `DROP SCHEMA IF EXISTS "${legacySchema}" CASCADE;`,
        );
      }

      // Run migration using the URL from .env.example.
      const apiSchema = `bnp324_${randomUUID().replaceAll('-', '')}`;
      const apiDatabaseUrl = `${databaseUrl}?schema=${apiSchema}`;
      temporarySchemas.push(apiSchema);
      executeSql(databaseUrl, `CREATE SCHEMA "${apiSchema}";`);
      const migrateOutput = execFileSync(
        'npx',
        [
          'prisma',
          'migrate',
          'dev',
          '--schema',
          'apps/api/prisma/schema.prisma',
        ],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 60_000,
          env: {
            ...process.env,
            DATABASE_URL: apiDatabaseUrl,
          },
        },
      );
      expect(migrateOutput).not.toMatch(/error/i);

      // Start the API and verify no PostgreSQL/Redis connection errors appear.
      await new Promise<void>((resolve, reject) => {
        const apiProcess = spawn('npm', ['run', 'dev', '-w', 'apps/api'], {
          cwd: repositoryRoot,
          stdio: 'pipe',
          detached: true,
          env: { ...process.env, DATABASE_URL: apiDatabaseUrl },
        });

        let output = '';
        const startTimeout = setTimeout(() => {
          if (apiProcess.pid) {
            process.kill(-apiProcess.pid, 'SIGTERM');
          } else {
            apiProcess.kill('SIGTERM');
          }
          reject(
            new Error(
              `API did not emit a ready signal within 30 s. Output:\n${output}`,
            ),
          );
        }, 30_000);

        const handleData = (data: Buffer) => {
          const chunk = data.toString();
          output += chunk;
          if (
            /Nest application successfully started/i.test(output) ||
            /Application is running on/i.test(output)
          ) {
            clearTimeout(startTimeout);
            try {
              expect(output).not.toMatch(/ECONNREFUSED/);
              expect(output).not.toMatch(/connection refused/i);
              if (!apiProcess.pid) {
                reject(new Error('API process PID is undefined'));
                return;
              }
              const pid = apiProcess.pid;
              const shutdownTimeout = setTimeout(() => {
                process.kill(-pid, 'SIGKILL');
                reject(new Error('API process did not stop within 5 s.'));
              }, 5_000);
              apiProcess.once('close', () => {
                clearTimeout(shutdownTimeout);
                resolve();
              });
              process.kill(-pid, 'SIGTERM');
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          }
        };

        apiProcess.stdout?.on('data', handleData);
        apiProcess.stderr?.on('data', handleData);

        apiProcess.on('error', (err) => {
          clearTimeout(startTimeout);
          reject(err);
        });
      });
    },
    API_STARTUP_TIMEOUT,
  );
});
