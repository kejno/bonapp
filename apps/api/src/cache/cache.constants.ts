export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const MENU_CACHE_TTL_SECONDS = 60;

export const menuCacheKey = (tenantId: string) => `menu:tenant:${tenantId}`;
