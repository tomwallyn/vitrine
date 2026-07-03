import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { useApi } from '@/lib/api';
import { colors, formatTimeSaved, type GalleryItem, type MeResponse } from '@vitrine/shared';

/** Nombre de vignettes « Dernières créations » affichées sur l'accueil. */
const RECENT_LIMIT = 6;

/** Découpe la liste en rangées de 3 (grille des dernières créations). */
function rowsOf3<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
  return rows;
}

/** Carte statistique (Visuels créés / Temps gagné) — crème + bordure. */
function StatCard({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** undefined = chargement → petit skeleton à la place de la valeur. */
  value: string | undefined;
  label: string;
}) {
  return (
    <View className="flex-1 rounded-2xl border border-paper3 bg-white px-4 py-4">
      <View className="h-8 w-8 items-center justify-center rounded-full bg-paper2">
        <Ionicons name={icon} size={15} color={colors.gray3} />
      </View>
      {value !== undefined ? (
        <Text className="mt-3 font-heading-bold text-2xl text-ink">{value}</Text>
      ) : (
        <View className="mt-4 h-6 w-12 rounded-md bg-paper2" />
      )}
      <Text className="mt-0.5 font-body text-xs text-gray2">{label}</Text>
    </View>
  );
}

/** Vignette cliquable d'une création récente → écran Résultat. */
function CreationTile({ item, onPress }: { item: GalleryItem; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      className="aspect-[3/4] flex-1 overflow-hidden rounded-2xl border border-paper3 bg-paper2 active:opacity-80"
    >
      {item.resultImageUrl ? (
        <Image
          source={{ uri: item.resultImageUrl }}
          className="h-full w-full"
          resizeMode="cover"
          accessibilityLabel={item.title}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Ionicons name="image-outline" size={22} color={colors.gray} />
        </View>
      )}
      <View className="absolute bottom-0 left-0 right-0 bg-ink/45 px-2 py-1">
        <Text numberOfLines={1} className="font-body-semibold text-[10px] text-white">
          {item.title}
        </Text>
      </View>
    </Pressable>
  );
}

/** Bandeau d'erreur discret avec action « Réessayer ». */
function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Réessayer"
      onPress={onRetry}
      className="flex-row items-center justify-between rounded-2xl border border-paper3 bg-white px-4 py-3 active:bg-paper2"
    >
      <Text className="flex-1 pr-3 font-body text-xs text-gray2">{message}</Text>
      <Text className="font-body-semibold text-xs text-ink underline">Réessayer</Text>
    </Pressable>
  );
}

/** Tab — ACCUEIL : boutique + crédits réels (GET /me), CTA capture, stats, dernières créations (GET /gallery). */
export default function HomeScreen() {
  const router = useRouter();
  const api = useApi();

  const {
    data: me,
    isError: meError,
    refetch: refetchMe,
  } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  const {
    data: recentData,
    isPending: recentPending,
    isError: recentError,
    refetch: refetchRecent,
  } = useQuery({
    queryKey: ['gallery', 'home-recent'],
    queryFn: () => api.gallery.list({ filter: 'all', sort: 'recent', limit: RECENT_LIMIT }),
  });

  const recent = recentData?.items.slice(0, RECENT_LIMIT) ?? [];
  const shopLine = me
    ? [me.shop.name, me.shop.city].filter(Boolean).join(' · ')
    : meError
      ? 'Boutique indisponible'
      : ' ';

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-8">
        {/* Header — wordmark + boutique (GET /me) + solde réel */}
        <View className="flex-row items-center justify-between pt-4">
          <View className="flex-1 pr-3">
            <Text className="font-heading-bold text-lg uppercase tracking-[4px] text-ink">
              Vitrine
            </Text>
            <Text numberOfLines={1} className="mt-0.5 font-body text-xs text-gray2">
              {shopLine}
            </Text>
          </View>
          {me ? (
            <CreditBadge credits={me.credits} />
          ) : (
            <View className="h-7 w-20 rounded-full border border-paper3 bg-paper2" />
          )}
        </View>

        {meError ? (
          <View className="mt-4">
            <ErrorRow
              message="Impossible de charger votre boutique."
              onRetry={() => void refetchMe()}
            />
          </View>
        ) : null}

        {/* Hero CTA — nouveau visuel → écran capture */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nouveau visuel"
          onPress={() => router.push('/capture')}
          className="mt-6 overflow-hidden rounded-3xl bg-ink px-6 pb-7 pt-7 active:opacity-90"
        >
          <View className="flex-row items-center justify-between">
            <View className="h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10">
              <Ionicons name="camera-outline" size={22} color={colors.offwhite} />
            </View>
            <View className="h-9 w-9 items-center justify-center rounded-full bg-white/10">
              <Ionicons name="arrow-forward" size={16} color={colors.offwhite} />
            </View>
          </View>
          <Text className="mt-6 font-heading-bold text-2xl text-offwhite">Nouveau visuel</Text>
          <Text className="mt-1.5 font-body text-sm leading-5 text-gray">
            Photographiez un vêtement sur cintre, obtenez un visuel prêt à publier en quelques
            secondes.
          </Text>
        </Pressable>

        {/* Stats réelles — GET /me (visuels générés + temps gagné estimé) */}
        <View className="mt-4 flex-row gap-3">
          <StatCard
            icon="images-outline"
            value={me ? String(me.stats.visualsCount) : meError ? '—' : undefined}
            label="Visuels créés"
          />
          <StatCard
            icon="time-outline"
            value={me ? formatTimeSaved(me.stats.timeSavedMinutes) : meError ? '—' : undefined}
            label="Temps gagné"
          />
        </View>

        {/* Dernières créations — GET /gallery (tri récent, 6 max) */}
        <View className="mt-8 flex-row items-center justify-between">
          <Text className="font-heading text-base text-ink">Dernières créations</Text>
          {recent.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/gallery')}
              className="py-1"
            >
              <Text className="font-body-semibold text-xs text-gray2">Tout voir</Text>
            </Pressable>
          ) : null}
        </View>

        {recentPending ? (
          <View className="mt-3 flex-row gap-3">
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                className="aspect-[3/4] flex-1 rounded-2xl border border-paper3 bg-paper2"
              />
            ))}
          </View>
        ) : recentError ? (
          <View className="mt-3">
            <ErrorRow
              message="Impossible de charger vos créations."
              onRetry={() => void refetchRecent()}
            />
          </View>
        ) : recent.length === 0 ? (
          <View className="mt-3 items-center rounded-3xl border border-paper3 bg-white px-6 py-8">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-paper2">
              <Ionicons name="shirt-outline" size={20} color={colors.gray2} />
            </View>
            <Text className="mt-4 text-center font-heading-bold text-base text-ink">
              Aucune création
            </Text>
            <Text className="mt-1.5 text-center font-body text-sm text-gray2">
              Photographiez votre premier vêtement pour lancer votre vitrine.
            </Text>
            <Button
              label="Photographier un vêtement"
              className="mt-5 self-stretch"
              onPress={() => router.push('/capture')}
            />
          </View>
        ) : (
          <View className="mt-3 gap-3">
            {rowsOf3(recent).map((row, rowIndex) => (
              <View key={rowIndex} className="flex-row gap-3">
                {row.map((item) => (
                  <CreationTile
                    key={item.id}
                    item={item}
                    onPress={() => router.push(`/result/${item.generationId}?fromGallery=1`)}
                  />
                ))}
                {Array.from({ length: 3 - row.length }, (_, i) => (
                  <View key={`pad-${i}`} className="flex-1" />
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
