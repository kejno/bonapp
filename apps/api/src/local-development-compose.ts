type CommandError = {
  message?: string;
  stderr?: string | Buffer;
  stdout?: string | Buffer;
};

export function isPostgresPortConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const commandError = error as CommandError;
  const output = `${commandError.message ?? ''}\n${String(commandError.stdout ?? '')}\n${String(commandError.stderr ?? '')}`;

  return (
    output.includes('5432') &&
    /port is already allocated|address already in use/i.test(output)
  );
}
