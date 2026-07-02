import { Stack } from 'expo-router';

/** Groupe onboarding — rend "(onboarding)" adressable par la garde d'auth du root. */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
