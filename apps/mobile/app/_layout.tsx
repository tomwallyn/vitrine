import '../global.css';

import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { cssInterop } from 'nativewind';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GenerationToast } from '@/components/GenerationToast';
import { GenerationTrackerHost } from '@/components/GenerationTrackerHost';
import { colors } from '@vitrine/shared';

// NativeWind v4 : les composants tiers doivent être enregistrés pour className.
cssInterop(SafeAreaView, { className: 'style' });

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

/**
 * Garde d'auth : les non-authentifiés ne voient que (onboarding) + (auth),
 * les authentifiés que (tabs) et les écrans du flux de création.
 */
function RootNavigator() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!isSignedIn}>
        <Stack.Screen name="(tabs)" />
        {/* Écrans secondaires : présentés en modal, fermables au swipe. */}
        <Stack.Screen name="my-shop" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen
          name="render-presets"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen name="billing" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="support" options={{ presentation: 'modal', gestureEnabled: true }} />
        {/* Flux de création : hub d'import → capture / angles → config. */}
        <Stack.Screen
          name="import-hub"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen name="capture" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen
          name="detail-angles"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen
          name="render-config"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        {/* Quittable : la génération continue en arrière-plan (tracker global). */}
        <Stack.Screen name="generating/[id]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="result/[id]" />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * Suivi global des générations + banner de fin — montés uniquement pour un
 * utilisateur connecté (le tracker consomme l'API authentifiée).
 */
function SignedInGenerationFeatures() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return (
    <>
      <GenerationTrackerHost />
      <GenerationToast />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider tokenCache={tokenCache} publishableKey={clerkPublishableKey}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <RootNavigator />
          {/* Tracker headless + banner par-dessus la navigation (absolute). */}
          <SignedInGenerationFeatures />
        </QueryClientProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}
