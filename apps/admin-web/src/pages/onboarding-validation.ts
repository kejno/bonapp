export const isValidUnp = (value: string): boolean => /^\d{9}$/.test(value);

export const isValidSlug = (value: string): boolean => /^[a-z0-9-]{3,50}$/.test(value);
