import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApi } from '@/lib/api';
import { colors, type MeResponse } from '@vitrine/shared';

/** Initiales de la boutique (« L'Atelier Nord » → « AN »). */
function initials(name: string): string {
  const words = name.split(/[\s']+/).filter((w) => w.length > 1);
  const source = words.length > 0 ? words : [name.trim()];
  return (
    source
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '·'
  );
}

/** 08 — PROFIL : boutique (GET /me) + stats + réglages + déconnexion. */
export default function ProfileScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  const shop = data?.shop;
  const memberSince = shop ? new Date(shop.createdAt).getFullYear() : null;
  const watermark = shop?.settings.watermark ?? true;

  /**
   * Export & filigrane — toggle optimiste persisté via PATCH /me
   * (settings.watermark), rollback si l'API échoue.
   */
  const watermarkMutation = useMutation({
    mutationFn: (next: boolean) =>
      api.patch<MeResponse>('/me', { settings: { watermark: next } }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['me'] });
      const previous = queryClient.getQueryData<MeResponse>(['me']);
      if (previous) {
        queryClient.setQueryData<MeResponse>(['me'], {
          ...previous,
          shop: {
            ...previous.shop,
            settings: { ...previous.shop.settings, watermark: next },
          },
        });
      }
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(['me'], context.previous);
    },
    onSuccess: (me) => queryClient.setQueryData(['me'], me),
  });

  const menu: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    hint?: string;
    href?: Href;
    /** Accessoire à droite (défaut : chevron). */
    right?: ReactNode;
    onPress?: () => void;
  }[] = [
    {
      icon: 'storefront-outline',
      label: 'Ma boutique',
      hint: 'Nom et ville',
      href: '/my-shop',
    },
    {
      icon: 'options-outline',
      label: 'Préréglages de rendu',
      hint: 'Style et mannequin par défaut',
    },
    {
      icon: 'water-outline',
      label: 'Export & filigrane',
      hint: shop
        ? watermark
          ? 'Filigrane « VITRINE » activé'
          : 'Filigrane désactivé'
        : undefined,
      onPress: shop ? () => watermarkMutation.mutate(!watermark) : undefined,
      right: (
        <Switch
          accessibilityLabel="Filigrane à l'export"
          value={watermark}
          disabled={!shop}
          onValueChange={(next) => watermarkMutation.mutate(next)}
          trackColor={{ true: colors.ink, false: colors.paper3 }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.paper3}
        />
      ),
    },
    { icon: 'card-outline', label: 'Facturation', hint: 'Aucun abonnement — packs de crédits' },
    { icon: 'help-circle-outline', label: 'Aide & support' },
  ];

  const onSignOut = async () => {
    await signOut();
    queryClient.clear();
    // La garde d'auth (Stack.Protected) ramène vers (onboarding)/welcome.
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        <Text className="pt-4 font-heading-bold text-2xl text-ink">Profil</Text>

        {/* Boutique — GET /me (shop créé à la première connexion) */}
        {isPending ? (
          <View className="mt-4 items-center rounded-3xl border border-paper3 bg-white px-5 py-8">
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : isError || !shop ? (
          <View className="mt-4 items-center rounded-3xl border border-paper3 bg-white px-5 py-6">
            <Text className="font-body text-sm text-gray2">Impossible de charger votre boutique.</Text>
            <Pressable accessibilityRole="button" onPress={() => refetch()} className="mt-3">
              <Text className="font-body-semibold text-sm text-ink underline">Réessayer</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/my-shop')}
            className="mt-4 flex-row items-center gap-4 rounded-3xl border border-paper3 bg-white px-5 py-5 active:bg-paper2"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full bg-ink">
              <Text className="font-heading-bold text-lg text-offwhite">{initials(shop.name)}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-heading-bold text-lg text-ink">{shop.name}</Text>
              <Text className="font-body text-sm text-gray2">
                {shop.city ? `${shop.city} · ` : ''}membre depuis {memberSince}
              </Text>
            </View>
            <Ionicons name="pencil-outline" size={18} color={colors.gray2} />
          </Pressable>
        )}

        {/* Stats : Visuels / Crédits / Temps gagné (crédits réels, le reste factice jusqu'à M3) */}
        <View className="mt-4 flex-row gap-3">
          {[
            { value: '—', label: 'Visuels' },
            { value: data ? String(data.credits) : '—', label: 'Crédits' },
            { value: '—', label: 'Temps gagné' },
          ].map((stat) => (
            <View
              key={stat.label}
              className="flex-1 items-center rounded-2xl border border-paper3 bg-white py-4"
            >
              <Text className="font-heading-bold text-xl text-ink">{stat.value}</Text>
              <Text className="mt-0.5 font-body text-xs text-gray2">{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Menu réglages */}
        <View className="mt-6 overflow-hidden rounded-3xl border border-paper3 bg-white">
          {menu.map((item, i) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={item.onPress ?? (item.href ? () => router.push(item.href!) : undefined)}
              className={`flex-row items-center gap-3 px-5 py-4 active:bg-paper2 ${
                i > 0 ? 'border-t border-paper2' : ''
              }`}
            >
              <Ionicons name={item.icon} size={20} color={colors.gray3} />
              <View className="flex-1">
                <Text className="font-body-semibold text-sm text-ink">{item.label}</Text>
                {item.hint ? (
                  <Text className="font-body text-xs text-gray">{item.hint}</Text>
                ) : null}
              </View>
              {item.right ?? <Ionicons name="chevron-forward" size={16} color={colors.gray} />}
            </Pressable>
          ))}
        </View>

        {/* Déconnexion — Clerk signOut */}
        <Pressable
          accessibilityRole="button"
          onPress={onSignOut}
          className="mt-6 items-center rounded-2xl border border-paper3 py-4 active:bg-paper2"
        >
          <Text className="font-body-semibold text-sm text-gray3">Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
