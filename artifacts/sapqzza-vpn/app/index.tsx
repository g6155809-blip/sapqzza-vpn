import { useAppContext } from '@/context/AppContext';
import KeyEntryScreen from '@/components/KeyEntryScreen';
import MainVpnScreen from '@/components/MainVpnScreen';
import { View, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function Index() {
  const { keyData } = useAppContext();
  const colors = useColors();

  // Still loading from AsyncStorage
  if (keyData === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!keyData) return <KeyEntryScreen />;
  return <MainVpnScreen />;
}
