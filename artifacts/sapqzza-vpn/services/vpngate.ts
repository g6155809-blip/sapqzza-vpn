/**
 * VPNGate Service — fetches free OpenVPN servers from vpngate.net
 * Operated by University of Tsukuba, Japan (public, free, no registration)
 */

export interface VpnGateServer {
  hostname: string;
  ip: string;
  score: number;
  ping: number;          // ms
  speedMbps: number;     // megabits per second
  countryLong: string;
  countryShort: string;
  flag: string;
  sessions: number;
  logType: string;       // 'Yes' | 'No' | '2weeks' etc
  ovpnConfig: string;    // full OpenVPN config string (decoded)
}

// Country code → emoji flag
const FLAGS: Record<string, string> = {
  JP: '🇯🇵', US: '🇺🇸', KR: '🇰🇷', TH: '🇹🇭', RU: '🇷🇺',
  DE: '🇩🇪', NL: '🇳🇱', FR: '🇫🇷', GB: '🇬🇧', CA: '🇨🇦',
  AU: '🇦🇺', SG: '🇸🇬', IN: '🇮🇳', BR: '🇧🇷', PL: '🇵🇱',
  IT: '🇮🇹', ES: '🇪🇸', SE: '🇸🇪', NO: '🇳🇴', CH: '🇨🇭',
  UA: '🇺🇦', CZ: '🇨🇿', HU: '🇭🇺', RO: '🇷🇴', TR: '🇹🇷',
  ID: '🇮🇩', MY: '🇲🇾', PH: '🇵🇭', VN: '🇻🇳', TW: '🇹🇼',
  MX: '🇲🇽', AR: '🇦🇷', ZA: '🇿🇦', EG: '🇪🇬', NG: '🇳🇬',
};

const COUNTRY_NAMES_RU: Record<string, string> = {
  JP: 'Япония',           US: 'США',              KR: 'Южная Корея',
  TH: 'Таиланд',          RU: 'Россия',            DE: 'Германия',
  NL: 'Нидерланды',       FR: 'Франция',           GB: 'Великобритания',
  CA: 'Канада',           AU: 'Австралия',          SG: 'Сингапур',
  IN: 'Индия',            BR: 'Бразилия',           PL: 'Польша',
  IT: 'Италия',           ES: 'Испания',            SE: 'Швеция',
  NO: 'Норвегия',         CH: 'Швейцария',          UA: 'Украина',
  CZ: 'Чехия',            HU: 'Венгрия',           RO: 'Румыния',
  TR: 'Турция',           ID: 'Индонезия',          MY: 'Малайзия',
  PH: 'Филиппины',        VN: 'Вьетнам',           TW: 'Тайвань',
  MX: 'Мексика',          AR: 'Аргентина',          ZA: 'ЮАР',
};

// Primary and fallback API endpoints
const ENDPOINTS = [
  'https://www.vpngate.net/api/iphone/',
  'https://vpngate.net/api/iphone/',
];

export async function fetchVpnGateServers(): Promise<VpnGateServer[]> {
  let lastError: unknown;

  for (const url of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18_000);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SAPQZZA-VPN/1.0 Android' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const servers = parseVpnGateCsv(text);
      if (servers.length > 0) return servers;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error('Не удалось загрузить серверы VPNGate');
}

function parseVpnGateCsv(csv: string): VpnGateServer[] {
  const lines = csv.split('\n');
  const servers: VpnGateServer[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Skip comments, header, empty lines, section markers
    if (!line || line.startsWith('*') || line.startsWith('#')) continue;

    const cols = line.split(',');
    if (cols.length < 15) continue;

    const ovpnBase64 = cols[14]?.trim();
    if (!ovpnBase64 || ovpnBase64.length < 100) continue;

    let ovpnConfig: string;
    try {
      // React Native (JavaScriptCore) supports atob/btoa
      ovpnConfig = decodeURIComponent(
        Array.from(atob(ovpnBase64))
          .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
      );
    } catch {
      continue;
    }

    // Must have a valid remote line
    if (!ovpnConfig.includes('remote ')) continue;

    const ping    = parseInt(cols[3]) || 999;
    const speed   = parseInt(cols[4]) || 0;
    const score   = parseInt(cols[2]) || 0;

    // Filter out very high-latency servers
    if (ping > 600) continue;

    const countryShort = cols[6]?.trim().toUpperCase() ?? '';

    servers.push({
      hostname:     cols[0]?.trim() ?? '',
      ip:           cols[1]?.trim() ?? '',
      score,
      ping,
      speedMbps:    Math.round(speed / 1_000_000 * 10) / 10,
      countryLong:  COUNTRY_NAMES_RU[countryShort] ?? cols[5]?.trim() ?? countryShort,
      countryShort,
      flag:         FLAGS[countryShort] ?? '🌐',
      sessions:     parseInt(cols[7]) || 0,
      logType:      cols[11]?.trim() ?? '',
      ovpnConfig,
    });
  }

  // Sort: best score first
  return servers.sort((a, b) => b.score - a.score);
}

/** Get unique countries from server list (best server per country) */
export function groupByCountry(servers: VpnGateServer[]): VpnGateServer[] {
  const seen = new Set<string>();
  const best: VpnGateServer[] = [];
  for (const s of servers) {
    if (!seen.has(s.countryShort)) {
      seen.add(s.countryShort);
      best.push(s);
    }
  }
  return best;
}
