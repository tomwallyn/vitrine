import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';

/** Entrée : authentifié → tabs, sinon → onboarding (01 ACCUEIL). */
export default function Index() {
  const { isSignedIn } = useAuth();
  return <Redirect href={isSignedIn ? '/(tabs)' : '/(onboarding)/welcome'} />;
}
