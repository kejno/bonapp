import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const REPOSITORY = process.env.GITHUB_REPOSITORY ?? 'kejno/bonapp';

export interface WorkflowJob {
  databaseId: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export interface WorkflowRun {
  databaseId: number;
  event: string;
  headBranch: string;
  headSha: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  jobs: WorkflowJob[];
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('gh', args, {
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout;
}

function configuredRunId(event: 'pull_request' | 'push'): string | undefined {
  return event === 'push'
    ? (process.env.CI_PUSH_RUN_ID ?? process.env.CI_WORKFLOW_RUN_ID)
    : (process.env.CI_PULL_REQUEST_RUN_ID ?? process.env.CI_WORKFLOW_RUN_ID);
}

export async function getCompletedWorkflowRuns(
  event: 'pull_request' | 'push',
  limit = 1,
): Promise<WorkflowRun[]> {
  const runId = configuredRunId(event);

  if (runId) {
    const run = await gh([
      'run',
      'view',
      runId,
      '--repo',
      REPOSITORY,
      '--json',
      'databaseId,event,headBranch,headSha,status,conclusion,createdAt,updatedAt,jobs',
    ]);
    return [JSON.parse(run) as WorkflowRun];
  }

  const args = [
    'run',
    'list',
    '--repo',
    REPOSITORY,
    '--workflow',
    'ci.yml',
    '--event',
    event,
    '--status',
    'completed',
    '--limit',
    String(limit),
    '--json',
    'databaseId',
  ];

  if (event === 'push') {
    args.push('--branch', 'main');
  }

  const listedRuns = JSON.parse(await gh(args)) as Array<{
    databaseId: number;
  }>;
  if (listedRuns.length < limit) {
    throw new Error(
      `Expected ${limit} completed ${event} CI run(s) in ${REPOSITORY}, found ${listedRuns.length}. ` +
        'Set CI_WORKFLOW_RUN_ID or the event-specific CI_*_RUN_ID to a completed run.',
    );
  }

  return Promise.all(
    listedRuns.map(({ databaseId }) =>
      gh([
        'run',
        'view',
        String(databaseId),
        '--repo',
        REPOSITORY,
        '--json',
        'databaseId,event,headBranch,headSha,status,conclusion,createdAt,updatedAt,jobs',
      ]).then((output) => JSON.parse(output) as WorkflowRun),
    ),
  );
}

export async function getRunById(runId: string): Promise<WorkflowRun> {
  const output = await gh([
    'run',
    'view',
    runId,
    '--repo',
    REPOSITORY,
    '--json',
    'databaseId,event,headBranch,headSha,status,conclusion,createdAt,updatedAt,jobs',
  ]);
  return JSON.parse(output) as WorkflowRun;
}

export async function getWorkflowLogs(runId: number): Promise<string> {
  return gh(['run', 'view', String(runId), '--repo', REPOSITORY, '--log']);
}

export async function downloadArtifact(
  runId: number,
  artifactName: string,
): Promise<number> {
  const downloadPath = await fs.mkdtemp(
    path.join(tmpdir(), 'github-artifact-'),
  );

  try {
    await gh([
      'run',
      'download',
      String(runId),
      '--repo',
      REPOSITORY,
      '--name',
      artifactName,
      '--dir',
      downloadPath,
    ]);
    const files = await fs.readdir(downloadPath, { recursive: true });
    const sizes = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(downloadPath, file);
        const stats = await fs.stat(filePath);
        return stats.isFile() ? stats.size : 0;
      }),
    );
    return sizes.reduce((total, size) => total + size, 0);
  } finally {
    await fs.rm(downloadPath, { force: true, recursive: true });
  }
}

export async function getRunArtifacts(
  runId: number,
): Promise<Array<{ id: number; name: string; expired: boolean }>> {
  const output = await gh([
    'api',
    `repos/${REPOSITORY}/actions/runs/${runId}/artifacts`,
  ]);
  return (
    JSON.parse(output) as {
      artifacts: Array<{ id: number; name: string; expired: boolean }>;
    }
  ).artifacts;
}

export async function downloadArtifactFiles(
  runId: number,
  artifactName: string,
): Promise<string[]> {
  const downloadPath = await fs.mkdtemp(
    path.join(tmpdir(), 'github-artifact-'),
  );

  try {
    await gh([
      'run',
      'download',
      String(runId),
      '--repo',
      REPOSITORY,
      '--name',
      artifactName,
      '--dir',
      downloadPath,
    ]);
    const entries = await fs.readdir(downloadPath, { recursive: true });
    const filePaths: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(downloadPath, String(entry));
      const stats = await fs.stat(fullPath);
      if (stats.isFile() && stats.size > 0) {
        filePaths.push(String(entry));
      }
    }
    return filePaths;
  } finally {
    await fs.rm(downloadPath, { force: true, recursive: true });
  }
}

export interface PullRequest {
  number: number;
  headSha: string;
  mergeable: boolean | null;
  mergeableState: string;
}

export async function getPullRequest(prNumber: string): Promise<PullRequest> {
  const output = await gh([
    'api',
    `repos/${REPOSITORY}/pulls/${prNumber}`,
  ]);
  const data = JSON.parse(output) as {
    number: number;
    head: { sha: string };
    mergeable: boolean | null;
    mergeable_state: string;
  };
  return {
    number: data.number,
    headSha: data.head.sha,
    mergeable: data.mergeable,
    mergeableState: data.mergeable_state,
  };
}
