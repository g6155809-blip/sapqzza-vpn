import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAppContext, type VpnGateServer } from '@/context/AppContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatTime(sec: number): string {
  const h   = Math.floor(sec / 3600);
  const m   = Math.floor((sec % 3600) / 60);
  const s   = sec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function maskKey(key: string): string {
  const parts = key.split('-');
  if (parts.length >= 3) return `${parts[0]}${'•'.repeat(8)}${parts[parts.length - 1]}`;
  if (key.length > 8)    return `${key.slice(0, 4)}${'•'.repeat(8)}${key.slice(-4)}`;
  return key;
}

function maskIp(ip: string): string {
  // Show first octet, mask middle two, show last
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1].replace(/./g, '●')}.${parts[2].replace(/./g, '●')}.${parts[3]}`;
}

// ─── Server list item ────────────────────────────────────────────────────────
function ServerItem({
  server, isSelected, onSelect, colors,
}: {
  server: VpnGateServer;
  isSelected: boolean;
  onSelect: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const hasConfig  = !!server.ovpnConfig;
  const pingColor  =
    server.ping < 80  ? colors.green :
    server.ping < 150 ? '#FFB020'    : colors.destructive;

  return (
    <TouchableOpacity
      style={[
        styles.serverItem,
        {
          backgroundColor: isSelected ? '#1A0D2E' : 'transparent',
          borderColor:     isSelected ? colors.primary : 'transparent',
          borderWidth: 1.5,
          opacity: hasConfig ? 1 : 0.5,
        },
      ]}
      onPress={onSelect}
      activeOpacity={0.8}
      disabled={!hasConfig}
    >
      <Text style={styles.serverItemFlag}>{server.flag}</Text>
      <View style={styles.serverItemInfo}>
        <Text style={[styles.serverItemCountry, { color: colors.foreground }]}>
          {server.countryLong}
        </Text>
        <Text style={[styles.serverItemCity, { color: colors.mutedForeground }]}>
          {hasConfig
            ? `${server.speedMbps > 0 ? server.speedMbps + ' Мбит/с · ' : ''}${server.sessions > 0 ? server.sessions + ' польз.' : 'Доступен'}`
            : 'Загружается...'}
        </Text>
      </View>
      <View style={[styles.pingTag, { backgroundColor: pingColor + '28' }]}>
        <Text style={[styles.pingTagText, { color: pingColor }]}>{server.ping} мс</Text>
      </View>
      {isSelected && (
        <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={{ marginLeft: 6 }} />
      )}
    </TouchableOpacity>
  );
}

// ─── IP Display Row ──────────────────────────────────────────────────────────
function IpRow({
  label, ip, masked, colors,
}: {
  label: string;
  ip: string;
  masked?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.ipRow}>
      <Text style={[styles.ipLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.ipValue, { color: ip === '—' ? colors.mutedForeground : colors.foreground }]}>
        {ip === '—' ? '—' : masked ? maskIp(ip) : ip}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function MainVpnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    vpnStatus, toggleVpn,
    selectedServer, setSelectedServer,
    servers, serversLoading, serversError, refreshServers,
    stats, keyData, deleteKey,
    realIp, vpnIp,
  } = useAppContext();

  const [showServers,  setShowServers]  = useState(false);
  const [showProfile,  setShowProfile]  = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const pulse1   = useRef(new Animated.Value(0)).current;
  const pulse2   = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const loop1Ref = useRef<Animated.CompositeAnimation | null>(null);
  const loop2Ref = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loop1Ref.current?.stop();
    loop2Ref.current?.stop();
    pulse1.setValue(0);
    pulse2.setValue(0);

    if (vpnStatus === 'connected') {
      Animated.timing(glowAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      loop1Ref.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse1, { toValue: 1, duration: 1600, useNativeDriver: true }),
          Animated.timing(pulse1, { toValue: 0, duration: 1600, useNativeDriver: true }),
        ]),
      );
      loop1Ref.current.start();
      loop2Ref.current = Animated.loop(
        Animated.sequence([
          Animated.delay(600),
          Animated.timing(pulse2, { toValue: 1, duration: 1600, useNativeDriver: true }),
          Animated.timing(pulse2, { toValue: 0, duration: 1600, useNativeDriver: true }),
        ]),
      );
      loop2Ref.current.start();
    } else if (vpnStatus === 'connecting') {
      Animated.timing(glowAnim, { toValue: 0.4, duration: 300, useNativeDriver: true }).start();
      loop1Ref.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse1, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulse1, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
      );
      loop1Ref.current.start();
    } else {
      Animated.timing(glowAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  }, [vpnStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const isConnected    = vpnStatus === 'connected';
  const isConnecting   = vpnStatus === 'connecting';
  const isDisconnecting = vpnStatus === 'disconnecting';
  const isBusy         = isConnecting || isDisconnecting;

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    toggleVpn();
  };

  const handleDeleteKey = () => {
    Alert.alert(
      'Удалить ключ',
      'VPN будет отключён. Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => { setShowProfile(false); await deleteKey(); },
        },
      ],
    );
  };

  const pulseOpacity1 = pulse1.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] });
  const pulseOpacity2 = pulse2.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.30] });

  const statusLabel =
    isConnected    ? 'Защищено'      :
    isConnecting   ? 'Подключение...' :
    isDisconnecting ? 'Отключение...' :
    'Не защищено';

  const statusColor =
    isConnected ? colors.green :
    isBusy      ? '#FFB020'   :
    colors.mutedForeground;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop:    insets.top  + (Platform.OS === 'web' ? 67 : 0),
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0),
        },
      ]}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={[styles.header, { marginTop: insets.top > 0 ? 0 : 12 }]}>
        <Text style={[styles.appTitle, { color: isConnected ? colors.foreground : colors.mutedForeground }]}>
          SAPQZZA VPN
        </Text>
        {isConnected && (
          <View style={[styles.pingBadge, { backgroundColor: colors.green + '22' }]}>
            <Ionicons name="shield-checkmark" size={12} color={colors.green} />
            <Text style={[styles.pingText, { color: colors.green }]}>Защита активна</Text>
          </View>
        )}
      </View>

      {/* ── Status ────────────────────────────────────────────────────── */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {statusLabel}
        </Text>
      </View>

      {/* ── IP Info Card ──────────────────────────────────────────────── */}
      <View style={[styles.ipCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <IpRow
          label="Ваш реальный IP"
          ip={realIp}
          masked={isConnected}
          colors={colors}
        />
        {isConnected && (
          <>
            <View style={[styles.ipDivider, { backgroundColor: colors.border }]} />
            <IpRow
              label="IP через VPN"
              ip={vpnIp}
              colors={colors}
            />
          </>
        )}
      </View>

      {/* ── Power button ──────────────────────────────────────────────── */}
      <View style={styles.powerArea}>
        <Animated.View style={[styles.ring3, { borderColor: colors.primary, opacity: pulseOpacity2 }]} />
        <Animated.View style={[styles.ring2, { borderColor: colors.primary, opacity: pulseOpacity1 }]} />
        <View
          style={[
            styles.ring1,
            { borderColor: isConnected ? colors.primary + '80' : colors.powerButtonBorder },
          ]}
        >
          <TouchableOpacity onPress={handleToggle} activeOpacity={0.85} disabled={isBusy && !isDisconnecting}>
            {isConnected ? (
              <LinearGradient
                colors={['#E040FB', '#FF4081']}
                style={styles.powerBtn}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
              >
                <Animated.View style={[styles.btnGlow, { opacity: glowAnim }]} />
                <Ionicons name="power" size={44} color="#FFFFFF" />
              </LinearGradient>
            ) : (
              <View style={[styles.powerBtn, { backgroundColor: colors.powerButtonBg }]}>
                {isBusy ? (
                  <ActivityIndicator size="large" color={colors.primary} />
                ) : (
                  <Ionicons name="power" size={44} color={colors.mutedForeground} />
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Label ─────────────────────────────────────────────────────── */}
      <Text style={[styles.connLabel, { color: colors.mutedForeground }]}>
        {isConnected     ? 'Нажмите для отключения'  :
         isConnecting    ? 'Устанавливается туннель...' :
         isDisconnecting ? 'Завершение подключения...' :
         'Нажмите для подключения'}
      </Text>

      {/* ── Bottom section ────────────────────────────────────────────── */}
      <View style={styles.bottomSection}>
        {/* Stats — only when connected */}
        {isConnected && (
          <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.statCol}>
              <Ionicons name="arrow-down-circle" size={20} color={colors.primary} />
              <Text style={[styles.statVal, { color: colors.foreground }]}>{formatBytes(stats.download)}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Загрузка</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statCol}>
              <Ionicons name="time-outline" size={20} color={colors.primary} />
              <Text style={[styles.statVal, { color: colors.foreground }]}>{formatTime(stats.seconds)}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Время</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statCol}>
              <Ionicons name="arrow-up-circle" size={20} color={colors.primary} />
              <Text style={[styles.statVal, { color: colors.foreground }]}>{formatBytes(stats.upload)}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Отдача</Text>
            </View>
          </View>
        )}

        {/* Server card */}
        <TouchableOpacity
          style={[styles.serverCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowServers(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.serverFlag}>{selectedServer.flag}</Text>
          <View style={styles.serverCardInfo}>
            <Text style={[styles.serverCardCountry, { color: colors.foreground }]}>
              {selectedServer.countryLong}
            </Text>
            <Text style={[styles.serverCardCity, { color: colors.mutedForeground }]}>
              {selectedServer.ping} мс
              {selectedServer.speedMbps > 0 ? ` · ${selectedServer.speedMbps} Мбит/с` : ''}
            </Text>
          </View>
          {serversLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View style={styles.changeRow}>
              <Text style={[styles.changeText, { color: colors.primary }]}>Сменить</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>

        {/* Bottom bar */}
        <View
          style={[
            styles.tabBar,
            {
              backgroundColor: colors.card,
              borderTopColor:  colors.border,
              paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
            },
          ]}
        >
          <TouchableOpacity style={styles.tabBtn} onPress={() => setShowProfile(true)} activeOpacity={0.8}>
            <View style={[styles.tabIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="person-outline" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.tabLabel, { color: colors.mutedForeground }]}>Профиль</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tabBtn} onPress={() => setShowSettings(true)} activeOpacity={0.8}>
            <View style={[styles.tabIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="settings-outline" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.tabLabel, { color: colors.mutedForeground }]}>Параметры</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ════════════════════════════════════════════════════════════════
          Server selection modal
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showServers} animationType="slide" transparent statusBarTranslucent>
        <TouchableOpacity style={styles.slideOverlay} activeOpacity={1} onPress={() => setShowServers(false)} />
        <View style={[styles.serverSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Выбрать сервер</Text>
            {serversError ? (
              <TouchableOpacity onPress={refreshServers} style={styles.retryBtn}>
                <Ionicons name="refresh" size={18} color={colors.primary} />
                <Text style={[styles.retryText, { color: colors.primary }]}>Обновить</Text>
              </TouchableOpacity>
            ) : serversLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <TouchableOpacity onPress={refreshServers} style={styles.retryBtn}>
                <Ionicons name="refresh" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {serversError && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>{serversError}</Text>
          )}

          <FlatList
            data={servers}
            keyExtractor={s => s.hostname + s.countryShort}
            renderItem={({ item }) => (
              <ServerItem
                server={item}
                isSelected={selectedServer.countryShort === item.countryShort}
                colors={colors}
                onSelect={() => {
                  setSelectedServer(item);
                  setShowServers(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              />
            )}
          />
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          Profile modal
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showProfile} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.centerOverlay}>
          <View style={[styles.profileCard, { backgroundColor: colors.secondary }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowProfile(false)}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>

            <LinearGradient
              colors={['#E040FB', '#9B59B6']}
              style={styles.avatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="shield-checkmark" size={32} color="#FFFFFF" />
            </LinearGradient>

            <Text style={[styles.sheetTitle, { color: colors.foreground, textAlign: 'center' }]}>
              Профиль
            </Text>

            <View style={styles.profileRows}>
              <View style={styles.profileRow}>
                <Text style={[styles.profileKey, { color: colors.mutedForeground }]}>Тип ключа</Text>
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>{keyData?.keyType ?? 'FREE'}</Text>
                </View>
              </View>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={styles.profileRow}>
                <Text style={[styles.profileKey, { color: colors.mutedForeground }]}>Ключ</Text>
                <Text style={[styles.profileVal, { color: colors.foreground }]}>
                  {keyData ? maskKey(keyData.key) : '—'}
                </Text>
              </View>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={styles.profileRow}>
                <Text style={[styles.profileKey, { color: colors.mutedForeground }]}>Запросы</Text>
                <Text style={[styles.profileVal, { color: colors.green }]}>
                  {keyData?.requests ?? '—'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.deleteBtn, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive }]}
              onPress={handleDeleteKey}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
              <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Удалить ключ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          Settings modal
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showSettings} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.centerOverlay}>
          <View style={[styles.settingsCard, { backgroundColor: colors.secondary }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowSettings(false)}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>

            <Text style={[styles.sheetTitle, { color: colors.foreground, textAlign: 'center', marginTop: 4 }]}>
              Параметры
            </Text>

            <View style={styles.settingsRows}>
              <TouchableOpacity
                style={styles.settingsRow}
                onPress={() => Linking.openURL('https://t.me/sapqzzavpn')}
                activeOpacity={0.8}
              >
                <Feather name="send" size={20} color={colors.primary} />
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Поддержка в Telegram</Text>
                <Feather name="external-link" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={styles.settingsRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Версия</Text>
                <Text style={[styles.settingsValue, { color: colors.mutedForeground }]}>1.1.0</Text>
              </View>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={styles.settingsRow}>
                <Ionicons name="globe-outline" size={20} color={colors.primary} />
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>VPN-серверы</Text>
                <Text style={[styles.settingsValue, { color: colors.mutedForeground }]}>VPNGate</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  appTitle:   { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  pingBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pingText:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  statusRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, gap: 8, marginBottom: 8 },
  statusDot:  { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  // IP Card
  ipCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
  },
  ipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ipLabel:   { fontSize: 13, fontFamily: 'Inter_400Regular' },
  ipValue:   { fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  ipDivider: { height: 1, marginVertical: 2 },

  // Power button
  powerArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring3: { position: 'absolute', width: 272, height: 272, borderRadius: 136, borderWidth: 1 },
  ring2: { position: 'absolute', width: 212, height: 212, borderRadius: 106, borderWidth: 1.5 },
  ring1: { width: 164, height: 164, borderRadius: 82, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  powerBtn: { width: 124, height: 124, borderRadius: 62, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  btnGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 62, backgroundColor: 'rgba(224,64,251,0.25)' },

  connLabel: { textAlign: 'center', fontSize: 15, fontFamily: 'Inter_400Regular', marginVertical: 16 },

  // Bottom
  bottomSection: { gap: 10, paddingHorizontal: 14 },
  statsCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statCol:     { alignItems: 'center', gap: 4, flex: 1 },
  statVal:     { fontSize: 15, fontFamily: 'Inter_700Bold' },
  statLbl:     { fontSize: 11, fontFamily: 'Inter_400Regular' },
  statDivider: { width: 1, height: 36 },

  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  serverFlag:        { fontSize: 28 },
  serverCardInfo:    { flex: 1 },
  serverCardCountry: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  serverCardCity:    { fontSize: 13, fontFamily: 'Inter_400Regular' },
  changeRow:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  changeText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 12,
    marginHorizontal: -14,
    paddingHorizontal: 40,
  },
  tabBtn:   { alignItems: 'center', gap: 6 },
  tabIcon:  { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Modals
  slideOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  serverSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, paddingTop: 10, maxHeight: '80%' },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle:  { fontSize: 20, fontFamily: 'Inter_700Bold' },
  retryBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  retryText:   { fontSize: 14, fontFamily: 'Inter_500Medium' },
  errorText:   { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 10, paddingHorizontal: 4 },

  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 8,
    gap: 10,
  },
  serverItemFlag:    { fontSize: 28 },
  serverItemInfo:    { flex: 1 },
  serverItemCountry: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  serverItemCity:    { fontSize: 13, fontFamily: 'Inter_400Regular' },
  pingTag:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  pingTagText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  profileCard: { width: '100%', borderRadius: 22, padding: 22, paddingTop: 18, alignItems: 'center', gap: 14 },
  closeBtn:    { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  avatar:      { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  profileRows: { width: '100%', gap: 2 },
  profileRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  profileKey:  { fontSize: 14, fontFamily: 'Inter_400Regular' },
  profileVal:  { fontSize: 14, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  badge:       { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  badgeText:   { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  rowDivider:  { height: 1 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  settingsCard: { width: '100%', borderRadius: 22, padding: 22, paddingTop: 18, gap: 14 },
  settingsRows: { gap: 0 },
  settingsRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  settingsLabel:{ flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  settingsValue:{ fontSize: 14, fontFamily: 'Inter_500Medium' },
});
