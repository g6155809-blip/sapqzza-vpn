// This route is not used — the app entry point is app/index.tsx
import { Redirect } from 'expo-router';
export default function TabIndex() {
  return <Redirect href="/" />;
}
