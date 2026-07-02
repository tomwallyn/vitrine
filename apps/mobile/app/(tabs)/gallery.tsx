import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useApi } from '@/lib/api';
import {
  colors,
  GALLERY_FILTERS,
  RENDER_TYPE_LABELS,
  type GalleryFilter,
  type GalleryItem,
  type GallerySort,
} from '@vitrine/shared';

const FILTER_LABELS: Record<GalleryFilter, string> = {
  all: 'Tout',
  model: 'Sur modèle',
  hanger: 'Cintre',
};

/** « 38 visuels générés » (compteur sous le titre, maquette 06). */
function counterLabel(total: number): string {
  return total > 1 ? `${total} visuels générés` : `${total} visuel généré`;
}

/** Vignette : rendu + titre en surimpression + type de rendu. */
function GalleryTile({ item }: { item: GalleryItem }) {
  return (
    <View className="mb-4 w-[48%]">
      <View className="aspect-[3/4] overflow-hidden rounded-2xl border border-paper3 bg-paper2">
        {item.resultImageUrl ? (
          <Image
            source={{ uri: item.resultImageUrl }}
            className="h-full w-full"
            resizeMode="cover"
            accessibilityLabel={item.title}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="image-outline" size={28} color={colors.gray} />
          </View>
        )}
        <View className="absolute bottom-0 left-0 right-0 bg-ink/45 px-2.5 py-1.5">
          <Text numberOfLines={1} className="font-body-semibold text-xs text-white">
            {item.title}
          </Text>
        </View>
      </View>
      <Text className="mt-1.5 font-body text-xs text-gray">
        {RENDER_TYPE_LABELS[item.renderType]}
      </Text>
    </View>
  );
}

/** 06 — GALERIE : « Mes créations », compteur, filtres, tri, grille + FAB. */
export default function GalleryScreen() {
  const router = useRouter();
  const api = useApi();
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [sort, setSort] = useState<GallerySort>('recent');

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['gallery', filter, sort],
    queryFn: ({ pageParam }) => api.gallery.list({ filter, sort, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore
        ? allPages.reduce((n, page) => n + page.items.length, 0)
        : undefined,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 px-5">
        {/* Header : titre + compteur + tri ⇅ */}
        <View className="flex-row items-end justify-between pt-4">
          <View>
            <Text className="font-heading-bold text-2xl text-ink">Mes créations</Text>
            <Text className="mt-1 font-body-medium text-xs text-gray">
              {total !== undefined ? counterLabel(total) : ' '}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sort === 'recent' ? 'Trier du plus ancien' : 'Trier du plus récent'}
            onPress={() => setSort((s) => (s === 'recent' ? 'oldest' : 'recent'))}
            className="h-9 w-9 items-center justify-center rounded-xl border border-paper3 bg-white active:bg-paper2"
          >
            <Ionicons name="swap-vertical" size={16} color={colors.gray3} />
          </Pressable>
        </View>

        {/* Filtres Tout / Sur modèle / Cintre — GET /gallery?filter=… */}
        <View className="mt-4 flex-row gap-2">
          {GALLERY_FILTERS.map((f) => {
            const selected = filter === f;
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(f)}
                className={`rounded-full border px-4 py-2 ${
                  selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
                }`}
              >
                <Text
                  className={`font-body-semibold text-xs ${
                    selected ? 'text-offwhite' : 'text-ink'
                  }`}
                >
                  {FILTER_LABELS[f]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Grille 2 colonnes (loading / erreur / vide / items) */}
        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.ink} />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center font-heading-bold text-lg text-ink">
              Galerie indisponible
            </Text>
            <Text className="mt-2 text-center font-body text-sm text-gray2">
              {error instanceof Error ? error.message : 'Réessayez dans un instant.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="mt-4 py-2"
            >
              <Text className="font-body-semibold text-sm text-ink underline">Réessayer</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <GalleryTile item={item} />}
            numColumns={2}
            className="mt-4 flex-1"
            columnWrapperStyle={{ justifyContent: 'space-between' }}
            contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }}
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="items-center py-4">
                  <ActivityIndicator color={colors.ink} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-4xl">🪞</Text>
                <Text className="mt-4 text-center font-heading-bold text-lg text-ink">
                  Aucune création
                </Text>
                <Text className="mt-2 text-center font-body text-sm text-gray2">
                  {filter === 'all'
                    ? 'Photographiez votre premier vêtement pour créer votre vitrine.'
                    : 'Aucun visuel de ce type pour le moment.'}
                </Text>
                {filter === 'all' ? (
                  <Button
                    label="Photographier un vêtement"
                    className="mt-6 self-stretch"
                    onPress={() => router.push('/capture')}
                  />
                ) : null}
              </View>
            }
          />
        )}
      </View>

      {/* FAB + — nouvelle capture */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouveau visuel"
        onPress={() => router.push('/capture')}
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-ink shadow-lg active:opacity-90"
      >
        <Ionicons name="add" size={28} color={colors.offwhite} />
      </Pressable>
    </SafeAreaView>
  );
}
