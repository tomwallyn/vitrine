import { Redirect } from 'expo-router';

/** M0 : pas d'auth — on entre par l'onboarding (01 ACCUEIL). */
export default function Index() {
  return <Redirect href="/(onboarding)/welcome" />;
}
