/**
 * Real IP detection service
 * Uses public APIs to fetch the device's current public IP address.
 */

const IP_APIS = [
  'https://api.ipify.org?format=json',
  'https://api4.my-ip.io/v2/ip.json',
  'https://ipinfo.io/json',
];

export interface IpInfo {
  ip: string;
  country?: string;
  city?: string;
}

export async function fetchRealIp(): Promise<IpInfo> {
  for (const url of IP_APIS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) continue;
      const data = await res.json();

      const ip =
        data.ip ??
        data.query ??
        data.YourFuckingIPAddress ??
        '';

      if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        return {
          ip,
          country: data.country ?? data.countryCode ?? undefined,
          city: data.city ?? undefined,
        };
      }
    } catch {
      // try next API
    }
  }
  return { ip: '—' };
}
