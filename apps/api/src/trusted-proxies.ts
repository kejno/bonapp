export function trustedProxySetting(
  configuredAddresses: string | undefined,
): false | string[] {
  const addresses = configuredAddresses
    ?.split(',')
    .map((address) => address.trim())
    .filter(Boolean);

  return addresses?.length ? addresses : false;
}
