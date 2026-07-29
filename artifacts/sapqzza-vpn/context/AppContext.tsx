import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

// ─── Valid keys (admin-controlled list) ────────────────────────────────────
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

// ─── Server list ────────────────────────────────────────────────────────────
export const SERVERS = [
  { id: 'nl', country: 'Нидерланды',     city: 'Amsterdam', region: 'Европа',            flag: '🇳🇱', ping: 45  },
  { id: 'de', country: 'Германия',        city: 'Frankfurt', region: 'Европа',            flag: '🇩🇪', ping: 55  },
  { id: 'fr', country: 'Франция',         city: 'Paris',     region: 'Европа',            flag: '🇫🇷', ping: 65  },
  { id: 'gb', country: 'Великобритания',  city: 'London',    region: 'Европа',            flag: '🇬🇧', ping: 75  },
  { id: 'jp', country: 'Япония',          city: 'Tokyo',     region: 'Азия',              flag: '🇯🇵', ping: 95  },
  { id: 'us', country: 'США',             city: 'New York',  region: 'Северная Америка', flag: '🇺🇸', ping: 120 },
  { id: 'sg', country: 'Сингапур',        city: 'Singapore', region: 'Азия',              flag: '🇸🇬', ping: 150 },
  { id: 'in', country: 'Индия',           city: 'Mumbai',    region: 'Азия',              flag: '🇮🇳', ping: 185 },
];
export type Server = (typeof SERVERS)[number];

// ─── Types ──────────────────────────────────────────────────────────────────
export type VpnStatus = 'disconnected' | 'connecting' | 'connected';

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
  /** undefined = still loading from storage */
  keyData: KeyData | null | undefined;
  activateKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  deleteKey: () => Promise<void>;

  vpnStatus: VpnStatus;
  toggleVpn: () => void;
  selectedServer: Server;
  setSelectedServer: (s: Server) => void;
  stats: Stats;
}

// ─── Storage keys ───────────────────────────────────────────────────────────
const SK = {
  KEY_DATA:  'sapqzza_key_data',
  DEVICE_ID: 'sapqzza_device_id',
  BINDINGS:  'sapqzza_bindings',
  SERVER:    'sapqzza_server',
};

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
  const [keyData, setKeyData]           = useState<KeyData | null | undefined>(undefined);
  const [vpnStatus, setVpnStatus]       = useState<VpnStatus>('disconnected');
  const [selectedServer, setServerState] = useState<Server>(SERVERS[0]);
  const [stats, setStats]               = useState<Stats>({ download: 0, upload: 0, seconds: 0 });
  const statsTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted key and server on mount
  useEffect(() => {
    (async () => {
      try {
        const storedKey    = await AsyncStorage.getItem(SK.KEY_DATA);
        const storedServer = await AsyncStorage.getItem(SK.SERVER);

        setKeyData(storedKey ? (JSON.parse(storedKey) as KeyData) : null);

        if (storedServer) {
          const parsed = JSON.parse(storedServer) as Server;
          const found  = SERVERS.find(s => s.id === parsed.id);
          if (found) setServerState(found);
        }
      } catch {
        setKeyData(null);
      }
    })();
  }, []);

  // Stats ticker
  useEffect(() => {
    if (vpnStatus === 'connected') {
      statsTimer.current = setInterval(() => {
        setStats(prev => ({
          download: prev.download + Math.floor(Math.random() * 4000 + 800),
          upload:   prev.upload   + Math.floor(Math.random() * 1000 + 100),
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

    const deviceId      = await getOrCreateDeviceId();
    const bindingsRaw   = await AsyncStorage.getItem(SK.BINDINGS);
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
    setVpnStatus('disconnected');
    await AsyncStorage.removeItem(SK.KEY_DATA);
    setKeyData(null);
  }, []);

  // ── VPN toggle ────────────────────────────────────────────────────────────
  const toggleVpn = useCallback(() => {
    if (vpnStatus === 'connected') {
      setVpnStatus('disconnected');
      return;
    }
    if (vpnStatus === 'connecting') return;

    Alert.alert(
      'Запрос подключения',
      'SAPQZZA VPN хочет создать VPN-подключение. Разрешить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Разрешить',
          onPress: () => {
            setVpnStatus('connecting');
            const delay = 1200 + Math.random() * 800;
            setTimeout(() => setVpnStatus('connected'), delay);
          },
        },
      ],
    );
  }, [vpnStatus]);

  // ── Server selection ──────────────────────────────────────────────────────
  const setSelectedServer = useCallback((server: Server) => {
    setServerState(server);
    AsyncStorage.setItem(SK.SERVER, JSON.stringify(server)).catch(() => {});
  }, []);

  return (
    <AppContext.Provider value={{ keyData, activateKey, deleteKey, vpnStatus, toggleVpn, selectedServer, setSelectedServer, stats }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
