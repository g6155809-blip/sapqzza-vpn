import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useAppContext } from '@/context/AppContext';

export default function KeyEntryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activateKey } = useAppContext();

  const [key, setKey]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleActivate = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Введите ключ доступа');
      return;
    }
    setLoading(true);
    setError('');
    const result = await activateKey(trimmed);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'Ошибка активации');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View
        style={[
          styles.inner,
          {
            paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 20),
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20),
          },
        ]}
      >
        {/* Logo */}
        <View style={styles.logoArea}>
          <LinearGradient
            colors={['#E040FB', '#9B59B6']}
            style={styles.logoGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.logoImage}
            />
          </LinearGradient>
          <Text style={[styles.appName, { color: colors.foreground }]}>SAPQZZA VPN</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Введите ключ доступа для входа
          </Text>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>КЛЮЧ ДОСТУПА</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.muted,
                borderColor: error ? colors.destructive : colors.border,
              },
            ]}
            value={key}
            onChangeText={t => { setKey(t); setError(''); }}
            placeholder="Введите ключ доступа"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleActivate}
            selectionColor={colors.primary}
          />
          {!!error && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          )}
        </View>

        {/* Button */}
        <TouchableOpacity
          onPress={handleActivate}
          disabled={loading}
          activeOpacity={0.85}
          style={[styles.btnWrapper, { opacity: loading ? 0.75 : 1 }]}
        >
          <LinearGradient
            colors={['#E040FB', '#FF4081']}
            style={styles.btn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.btnText}>Активировать</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Ключ привязывается к вашему устройству. Один ключ — одно устройство.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 20,
  },
  logoArea: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  logoGradient: {
    width: 88,
    height: 88,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 18,
  },
  appName: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    gap: 10,
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
  },
  input: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 1.5,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  btnWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  btn: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
});
