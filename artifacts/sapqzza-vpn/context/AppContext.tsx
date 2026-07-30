import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { fetchVpnGateServers, groupByCountry, type VpnGateServer } from '@/services/vpngate';
import { fetchRealIp } from '@/services/realip';

// ─── Re-export VpnGateServer as Server for UI components ───────────────────
export type Server = VpnGateServer;
export type { VpnGateServer };

// ─── Fallback static servers (shown while VPNGate loads) ───────────────────
export const SERVERS: VpnGateServer[] = [
  { hostname: 'nl', ip: '', score: 999, ping: 45,  speedMbps: 50, countryLong: 'Нидерланды',     countryShort: 'NL', flag: '🇳🇱', sessions: 0, logType: '', ovpnConfig: '' },
  { hostname: 'de', ip: '', score: 998, ping: 55,  speedMbps: 45, countryLong: 'Германия',        countryShort: 'DE', flag: '🇩🇪', sessions: 0, logType: '', ovpnConfig: '' },
  { hostname: 'us', ip: '', score: 997, ping: 120, speedMbps: 40, countryLong: 'США',             countryShort: 'US', flag: '🇺🇸', sessions: 0, logType: '', ovpnConfig: '' },
  { hostname: 'jp', ip: '', score: 996, ping: 95,  speedMbps: 60, countryLong: 'Япония',          countryShort: 'JP', flag: '🇯🇵', sessions: 0, logType: '', ovpnConfig: '' },
  { hostname: 'sg', ip: '', score: 995, ping: 150, speedMbps: 30, countryLong: 'Сингапур',        countryShort: 'SG', flag: '🇸🇬', sessions: 0, logType: '', ovpnConfig: '' },
  { hostname: 'gb', ip: '', score: 994, ping: 75,  speedMbps: 35, countryLong: 'Великобритания',  countryShort: 'GB', flag: '🇬🇧', sessions: 0, logType: '', ovpnConfig: '' },
  { hostname: 'fr', ip: '', score: 993, ping: 65,  speedMbps: 42, countryLong: 'Франция',         countryShort: 'FR', flag: '🇫🇷', sessions: 0, logType: '', ovpnConfig: '' },
  { hostname: 'kr', ip: '', score: 992, ping: 85,  speedMbps: 55, countryLong: 'Южная Корея',     countryShort: 'KR', flag: '🇰🇷', sessions: 0, logType: '', ovpnConfig: '' },
];

// ─── Valid keys ─────────────────────────────────────────────────────────────
const VALID_KEYS: Record<string, { keyType: string; requests: string }> = {
  'SAPQZZA-2026-PREM': { keyType: 'PREMIUM', requests: 'Безлимит' },
  'NEWO-SAPQ-2026':    { keyType: 'PREMIUM', requests: 'Безлимит' },
  'SAPVPN-PREM-001':   { keyType: 'PREMIUM', requests: 'Безлимит' },
  'SAPVPN-PREM-002':   { keyType: 'PREMIUM', requests: 'Безлимит' },
  'SAPVPN-PREM-003':   { keyType: 'PREMIUM', requests: 'Безлимит' },
  'SAPVPN-PREM-004':   { keyType: 'PREMIUM', requests: 'Безлимит' },
  'SAPVPN-PREM-005':   { keyType: 'PREMIUM', requests: 'Безлимит' },
  'SAPVPN-FREE-001':   { keyType: 'FREE',    requests: '100' },
  'SAPVPN-FREE-002':   { keyType: 'FREE',    requests: '100' },
  'SAPVPN-FREE-003':   { keyType: 'FREE',    requests: '100' },
};

// ─── Types ──────────────────────────────────────────────────────────────────
export type VpnStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export interface KeyData {
  key: string;
  keyType: string;
  requests: string;
  deviceId: string;
}

export interface Stats {
  download: number; // bytes
  upload: number;   // bytes
  seconds: number;
}

interface AppContextValue {
  keyData: KeyData | null | undefined;
  activateKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  deleteKey: () => Promise<void>;

  vpnStatus: VpnStatus;
  toggleVpn: () => void;

  selectedServer: VpnGateServer;
  setSelectedServer: (s: VpnGateServer) => void;

  servers: VpnGateServer[];
  serversLoading: boolean;
  serversError: string | null;
  refreshServers: () => Promise<void>;

  stats: Stats;
  realIp: string;
  vpnIp: string;
}

// ─── Storage keys ───────────────────────────────────────────────────────────
const SK = {
  KEY_DATA:  'sapqzza_key_data',
  DEVICE_ID: 'sapqzza_device_id',
  BINDINGS:  'sapqzza_bindings',
  COUNTRY:   'sapqzza_country',
};

// ─── Native OpenVPN bridge ──────────────────────────────────────────────────
// Loaded dynamically so the app doesn't crash in Expo Go / web
let OpenVPN: any = null;
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    OpenVPN = require('react-native-openvpn').default;
  } catch {
    console.log('[VPN] react-native-openvpn not available — simulation mode');
  }
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(SK.DEVICE_ID);
  if (existing) return existing;
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
  await AsyncStorage.setItem(SK.DEVICE_ID, id);
  return id;
}

// ─── Context ────────────────────────────────────────────────────────────────
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [keyData,        setKeyData]        = useState<KeyData | null | undefined>(undefined);
  const [vpnStatus,      setVpnStatus]      = useState<VpnStatus>('disconnected');
  const [servers,        setServers]        = useState<VpnGateServer[]>(SERVERS);
  const [serversLoading, setServersLoading] = useState(false);
  const [serversError,   setServersError]   = useState<string | null>(null);
  const [selectedServer, setServerState]    = useState<VpnGateServer>(SERVERS[0]);
  const [stats,          setStats]          = useState<Stats>({ download: 0, upload: 0, seconds: 0 });
  const [realIp,         setRealIp]         = useState('—');
  const [vpnIp,          setVpnIp]          = useState('—');

  const statsTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const vpnListener = useRef<any>(null);

  // ── Fetch real IP on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetchRealIp().then(info => {
      if (info.ip !== '—') setRealIp(info.ip);
    }).catch(() => {});
  }, []);

  // ── Load persisted data on mount ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const storedKey     = await AsyncStorage.getItem(SK.KEY_DATA);
        const storedCountry = await AsyncStorage.getItem(SK.COUNTRY);
        setKeyData(storedKey ? (JSON.parse(storedKey) as KeyData) : null);
        if (storedCountry) {
          // Will be updated once VPNGate servers load
          const fallback = SERVERS.find(s => s.countryShort === storedCountry);
          if (fallback) setServerState(fallback);
        }
      } catch {
        setKeyData(null);
      }
    })();
  }, []);

  // ── Load VPNGate servers ──────────────────────────────────────────────────
  const refreshServers = useCallback(async () => {
    setServersLoading(true);
    setServersError(null);
    try {
      const all     = await fetchVpnGateServers();
      const grouped = groupByCountry(all);
      setServers(grouped);

      // Restore country preference
      const storedCountry = await AsyncStorage.getItem(SK.COUNTRY);
      if (storedCountry) {
        const best = grouped.find(s => s.countryShort === storedCountry);
        if (best) setServerState(best);
      }
    } catch (e: any) {
      console.log('[VPN] VPNGate load error:', e?.message);
      setServersError('Не удалось загрузить серверы. Проверьте интернет.');
      // Keep fallback static servers
    } finally {
      setServersLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshServers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── OpenVPN native event listener ─────────────────────────────────────────
  useEffect(() => {
    if (!OpenVPN) return;

    vpnListener.current = DeviceEventEmitter.addListener(
      'stateChanged',
      (e: { state: string }) => {
        const s = e?.state ?? '';
        console.log('[VPN] native state:', s);

        if (s === 'CONNECTED') {
          setVpnStatus('connected');
          // Fetch new IP after a brief delay (tunnel needs to stabilize)
          setTimeout(() => {
            fetchRealIp().then(info => {
              if (info.ip !== '—') setVpnIp(info.ip);
            }).catch(() => {});
          }, 2000);
        } else if (
          s === 'CONNECTING'  || s === 'RESOLVE'   || s === 'WAIT' ||
          s === 'AUTH'        || s === 'GET_CONFIG' || s === 'ASSIGN_IP' ||
          s === 'RECONNECTING'
        ) {
          setVpnStatus('connecting');
        } else if (s === 'DISCONNECTED' || s === 'EXITING' || s === 'NONETWORK') {
          setVpnStatus('disconnected');
          setVpnIp('—');
        } else if (s === 'DISCONNECTING') {
          setVpnStatus('disconnecting');
        }
      },
    );

    return () => {
      vpnListener.current?.remove?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stats ticker ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (vpnStatus === 'connected') {
      statsTimer.current = setInterval(() => {
        setStats(prev => ({
          download: prev.download + Math.floor(Math.random() * 6_000 + 1_000),
          upload:   prev.upload   + Math.floor(Math.random() * 1_500 + 200),
          seconds:  prev.seconds  + 1,
        }));
      }, 1000);
    } else {
      if (statsTimer.current) {
        clearInterval(statsTimer.current);
        statsTimer.current = null;
      }
      if (vpnStatus === 'disconnected') {
        setStats({ download: 0, upload: 0, seconds: 0 });
      }
    }
    return () => {
      if (statsTimer.current) clearInterval(statsTimer.current);
    };
  }, [vpnStatus]);

  // ── Key activation ────────────────────────────────────────────────────────
  const activateKey = useCallback(async (input: string) => {
    const code = input.trim().toUpperCase();
    if (!VALID_KEYS[code]) {
      return { success: false, error: 'Неверный ключ. Проверьте и попробуйте снова.' };
    }
    const deviceId    = await getOrCreateDeviceId();
    const bindingsRaw = await AsyncStorage.getItem(SK.BINDINGS);
    const bindings: Record<string, string> = bindingsRaw ? JSON.parse(bindingsRaw) : {};

    if (bindings[code] && bindings[code] !== deviceId) {
      return { success: false, error: 'Этот ключ уже используется на другом устройстве.' };
    }
    bindings[code] = deviceId;
    await AsyncStorage.setItem(SK.BINDINGS, JSON.stringify(bindings));
    const data: KeyData = { key: code, ...VALID_KEYS[code], deviceId };
    await AsyncStorage.setItem(SK.KEY_DATA, JSON.stringify(data));
    setKeyData(data);
    return { success: true };
  }, []);

  // ── Key deletion ──────────────────────────────────────────────────────────
  const deleteKey = useCallback(async () => {
    if (vpnStatus !== 'disconnected') {
      try { await OpenVPN?.disconnect(); } catch {}
    }
    setVpnStatus('disconnected');
    await AsyncStorage.removeItem(SK.KEY_DATA);
    setKeyData(null);
  }, [vpnStatus]);

  // ── VPN toggle ────────────────────────────────────────────────────────────
  const toggleVpn = useCallback(() => {
    if (vpnStatus === 'connected' || vpnStatus === 'connecting') {
      // Disconnect
      if (OpenVPN) {
        OpenVPN.disconnect().catch(console.error);
        setVpnStatus('disconnecting');
      } else {
        setVpnStatus('disconnected');
      }
      return;
    }

    if (vpnStatus === 'disconnecting') return;

    if (!selectedServer.ovpnConfig) {
      Alert.alert(
        'Серверы загружаются',
        'Подождите, пока список серверов VPN загрузится, или выберите другой сервер.',
        [{ text: 'OK' }],
      );
      return;
    }

    const doConnect = async () => {
      setVpnStatus('connecting');
      try {
        if (OpenVPN) {
          // Prepare VPN permission (Android VpnService dialog)
          await OpenVPN.prepare?.();
          await OpenVPN.connect({
            ovpnFileName:      'sapqzza',
            ovpnString:        selectedServer.ovpnConfig,
            username:          '',
            password:          '',
            notificationTitle: 'SAPQZZA VPN',
            notificationText:  `Подключено — ${selectedServer.countryLong}`,
          });
          // State will be updated via DeviceEventEmitter
        } else {
          // Dev simulation (Expo Go / web)
          console.log('[VPN] Simulation mode — no native OpenVPN');
          const delay = 1400 + Math.random() * 800;
          setTimeout(() => {
            setVpnStatus('connected');
            setVpnIp('185.220.' + Math.floor(Math.random() * 254 + 1) + '.' + Math.floor(Math.random() * 254 + 1));
          }, delay);
        }
      } catch (e: any) {
        console.error('[VPN] connect error:', e);
        setVpnStatus('disconnected');
        Alert.alert('Ошибка подключения', e?.message ?? 'Попробуйте другой сервер.');
      }
    };

    Alert.alert(
      'Подключение VPN',
      `Подключиться к ${selectedServer.countryLong}?\n\nВаш IP будет изменён на IP сервера.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Подключить', onPress: doConnect },
      ],
    );
  }, [vpnStatus, selectedServer]);

  // ── Server selection ──────────────────────────────────────────────────────
  const setSelectedServer = useCallback((server: VpnGateServer) => {
    setServerState(server);
    AsyncStorage.setItem(SK.COUNTRY, server.countryShort).catch(() => {});
  }, []);

  return (
    <AppContext.Provider
      value={{
        keyData, activateKey, deleteKey,
        vpnStatus, toggleVpn,
        selectedServer, setSelectedServer,
        servers, serversLoading, serversError, refreshServers,
        stats, realIp, vpnIp,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
