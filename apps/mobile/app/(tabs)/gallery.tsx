import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useApi } from '@/lib/api';
import { useActiveGenerations, type TrackedGeneration } from '@/lib/generation-tracker';
import { t } from '@/lib/i18n';
import { renderTypeLabel } from '@/lib/i18n/labels';
import {
  colors,
  GALLERY_FILTERS,
  type GalleryFilter,
  type GalleryItem,
  type GallerySort,
} from '@vitrine/shared';

const FILTER_LABELS: Record<GalleryFilter, string> = {
  all: t('gallery.filterAll'),
  vetement: t('gallery.filterVetement'),
  objet: t('gallery.filterObjet'),
  model: t('gallery.filterModel'),
  hanger: t('gallery.filterHanger'),
};

/** « 38 visuels générés » (compteur sous le titre, maquette 06). */
function counterLabel(total: number): string {
  return t('gallery.visualsCount', { count: total });
}

/**
 * Tuile « en cours » : génération suivie par le tracker global, affichée en
 * tête de grille (spinner + type de rendu). Disparaît une fois terminée.
 */
function ActiveGenerationTile({ gen }: { gen: TrackedGeneration }) {
  const inFlight = gen.status === 'queued' || gen.status === 'processing';
  return (
    <View className="mb-4 w-[48%]">
      <View className="aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-paper3 bg-paper2">
        {gen.sourceImageUrl ? (
          <Image
            source={{ uri: gen.sourceImageUrl }}
            className="absolute h-full w-full opacity-15"
            resizeMode="cover"
            accessibilityLabel={t('gallery.sourcePhotoLabel')}
          />
        ) : null}
        {inFlight ? (
          <>
            <ActivityIndicator size="small" color={colors.ink} />
            <Text className="mt-2.5 font-body-semibold text-xs text-ink">{t('gallery.inProgress')}</Text>
          </>
        ) : gen.status === 'done' ? (
          <>
            <View className="h-8 w-8 items-center justify-center rounded-full bg-ink">
              <Ionicons name="checkmark" size={16} color={colors.offwhite} />
            </View>
            <Text className="mt-2.5 font-body-semibold text-xs text-ink">{t('gallery.done')}</Text>
          </>
        ) : (
          <>
            <Ionicons name="alert-circle-outline" size={24} color={colors.gray2} />
            <Text className="mt-2.5 font-body-semibold text-xs text-gray2">{t('gallery.failed')}</Text>
          </>
        )}
      </View>
      <Text className="mt-1.5 font-body text-xs text-gray">
        {renderTypeLabel(gen.renderType)}
      </Text>
    </View>
  );
}

/** Vignette cliquable → écran Résultat (comparateur + re-téléchargement).
 *  Appui long → confirmation de suppression de la galerie. */
function GalleryTile({
  item,
  onPress,
  onLongPress,
}: {
  item: GalleryItem;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('gallery.viewVisual', { title: item.title })}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="mb-4 w-[48%] active:opacity-80"
    >
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
        {renderTypeLabel(item.renderType)}
      </Text>
    </Pressable>
  );
}

/** 06 — GALERIE : « Mes créations », compteur, filtres, tri, grille + FAB. */
export default function GalleryScreen() {
  const router = useRouter();
  const api = useApi();
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [sort, setSort] = useState<GallerySort>('recent');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // valeur débouncée envoyée à l'API
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  // Générations en cours (tracker global) — tuiles en tête de grille.
  const activeGenerations = useActiveGenerations();

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
    queryKey: ['gallery', filter, sort, query],
    queryFn: ({ pageParam }) =>
      api.gallery.list({ filter, sort, offset: pageParam, ...(query ? { q: query } : {}) }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore
        ? allPages.reduce((n, page) => n + page.items.length, 0)
        : undefined,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total;

  // Suppression d'un visuel (appui long → confirmation). Invalide la galerie.
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.gallery.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery'] }),
    onError: (err) =>
      Alert.alert(
        t('gallery.unavailableTitle'),
        err instanceof Error ? err.message : t('gallery.unavailableDefault'),
      ),
  });
  const confirmDelete = (item: GalleryItem) =>
    Alert.alert(t('gallery.deleteTitle'), t('gallery.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('gallery.deleteConfirm'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(item.id),
      },
    ]);

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 px-5">
        {/* Header : titre + compteur + tri ⇅ */}
        <View className="flex-row items-end justify-between pt-4">
          <View>
            <Text className="font-heading-bold text-2xl text-ink">{t('gallery.title')}</Text>
            <Text className="mt-1 font-body-medium text-xs text-gray">
              {total !== undefined ? counterLabel(total) : ' '}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sort === 'recent' ? t('gallery.sortOldest') : t('gallery.sortRecent')}
            onPress={() => setSort((s) => (s === 'recent' ? 'oldest' : 'recent'))}
            className="h-9 w-9 items-center justify-center rounded-xl border border-paper3 bg-white active:bg-paper2"
          >
            <Ionicons name="swap-vertical" size={16} color={colors.gray3} />
          </Pressable>
        </View>

        {/* Barre de recherche */}
        <View className="mt-4 flex-row items-center gap-2 rounded-2xl border border-paper3 bg-white px-3.5 py-2.5">
          <Ionicons name="search" size={16} color={colors.gray} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('gallery.searchPlaceholder')}
            placeholderTextColor={colors.gray}
            className="flex-1 font-body text-sm text-ink"
            returnKeyType="search"
            autoCorrect={false}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('gallery.clearSearch')}
              hitSlop={8}
              onPress={() => setSearch('')}
            >
              <Ionicons name="close-circle" size={16} color={colors.gray} />
            </Pressable>
          ) : null}
        </View>

        {/* Filtres — GET /gallery?filter=… (scroll horizontal) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3 max-h-11 flex-grow-0"
          contentContainerClassName="gap-2 pr-5"
        >
          {GALLERY_FILTERS.map((f) => {
            const selected = filter === f;
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(f)}
                className={`h-9 justify-center rounded-full border px-4 ${
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
        </ScrollView>

        {/* Grille 2 colonnes (loading / erreur / vide / items) */}
        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.ink} />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center font-heading-bold text-lg text-ink">
              {t('gallery.unavailableTitle')}
            </Text>
            <Text className="mt-2 text-center font-body text-sm text-gray2">
              {error instanceof Error ? error.message : t('gallery.unavailableDefault')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="mt-4 py-2"
            >
              <Text className="font-body-semibold text-sm text-ink underline">{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <GalleryTile
                item={item}
                onPress={() => router.push(`/result/${item.generationId}?fromGallery=1`)}
                onLongPress={() => confirmDelete(item)}
              />
            )}
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
            ListHeaderComponent={
              activeGenerations.length > 0 ? (
                <View className="flex-row flex-wrap justify-between">
                  {activeGenerations.map((gen) => (
                    <ActiveGenerationTile key={gen.id} gen={gen} />
                  ))}
                </View>
              ) : null
            }
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
                  {query ? t('gallery.noResults') : t('gallery.noCreations')}
                </Text>
                <Text className="mt-2 text-center font-body text-sm text-gray2">
                  {query
                    ? t('gallery.noResultsFor', { query })
                    : filter === 'all'
                      ? t('gallery.emptyAllSubtitle')
                      : t('gallery.emptyFilteredSubtitle')}
                </Text>
                {filter === 'all' && !query ? (
                  <Button
                    label={t('gallery.ctaCreate')}
                    className="mt-6 self-stretch"
                    onPress={() => router.push('/product-type')}
                  />
                ) : null}
              </View>
            }
          />
        )}
      </View>

      {/* FAB + — nouveau visuel → hub d'import (1 photo / angles / lot) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('gallery.newVisual')}
        onPress={() => router.push('/product-type')}
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-ink shadow-lg active:opacity-90"
      >
        <Ionicons name="add" size={28} color={colors.offwhite} />
      </Pressable>
    </SafeAreaView>
  );
}
