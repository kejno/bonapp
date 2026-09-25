process.env.JWT_SECRET ??= 'e2e-test-jwt-secret';
process.env.TOTP_ENCRYPTION_KEY ??= 'ab'.repeat(32);
process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_PUBLIC_ENDPOINT ??= process.env.S3_ENDPOINT;
process.env.S3_BUCKET ??= 'bonapp-e2e';
process.env.S3_ACCESS_KEY ??= 'e2e-access-key';
process.env.S3_SECRET_KEY ??= 'e2e-secret-key';
