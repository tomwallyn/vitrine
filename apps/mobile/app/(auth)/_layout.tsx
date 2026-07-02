import { Stack } from 'expo-router';

/** Groupe auth — rend "(auth)" adressable par la garde d'auth du root. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
