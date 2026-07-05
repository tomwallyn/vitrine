import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { useBatchDraft } from '@/lib/batch-draft';
import { t } from '@/lib/i18n';
import { useRenderDraft } from '@/lib/render-draft';
import { uploadImageAsync } from '@/lib/upload';
import { colors, type MeResponse } from '@vitrine/shared';

/** Mode d'import : 1 photo · multi-angles · lot. */
type ImportMode = 'single' | 'angles' | 'batch';
/** Source de la photo (mode « Une seule photo » uniquement). */
type ImportSource = 'camera' | 'gallery';

type ModeCard = {
  value: ImportMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  badge?: string;
};

/** Modes d'import adaptés au sujet (vêtement/objet). */
function buildModes(isObjet: boolean): ModeCard[] {
  const noun = isObjet ? t('importHub.nounObjet') : t('importHub.nounVetement');
  return [
    {
      value: 'single',
      icon: 'image-outline',
      title: t('importHub.modeSingleTitle'),
      description: t('importHub.modeSingleDescription', { noun }),
    },
    {
      value: 'angles',
      icon: 'layers-outline',
      title: t('importHub.modeAnglesTitle'),
      description: t('importHub.modeAnglesDescription'),
    },
    {
      value: 'batch',
      icon: 'albums-outline',
      title: isObjet ? t('importHub.modeBatchTitleObjet') : t('importHub.modeBatchTitleVetement'),
      description: t('importHub.modeBatchDescription'),
      badge: t('importHub.badgeFast'),
    },
  ];
}

/** 01b — HUB D'IMPORT : mode (1 photo / angles / lot) + source, puis routage. */
export default function ImportHubScreen() {
  const router = useRouter();
  const api = useApi();
  const [mode, setMode] = useState<ImportMode>('single');
  const [source, setSource] = useState<ImportSource>('camera');
  const subjectType = useRenderDraft((s) => s.subjectType);
  const modes = buildModes(subjectType === 'objet');

  // Solde de crédits (header).
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  /**
   * Une seule photo + Galerie : import 1 image → brouillon + upload GCS en
   * arrière-plan (même pattern que l'écran capture) → écran 03.
   */
  const pickSingleFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    const draft = useRenderDraft.getState();
    draft.startDraft(asset.uri);
    draft.setSourceUploading();
    router.push(draft.subjectType === 'objet' ? '/object-config' : '/render-config');

    uploadImageAsync(api, asset.uri, 'source')
      .then(({ publicUrl, objectPath }) =>
        useRenderDraft.getState().setSourceUploaded(publicUrl, objectPath),
      )
      .catch((err: unknown) =>
        useRenderDraft
          .getState()
          .setSourceUploadFailed(err instanceof Error ? err.message : t('importHub.uploadError')),
      );
  };

  const onContinue = () => {
    if (mode === 'batch') {
      // Nouveau lot : on repart propre et on fige le sujet commun (vêtement/objet).
      useBatchDraft.getState().reset();
      useBatchDraft.getState().setSubjectType(subjectType);
      router.push('/batch');
      return;
    }
    if (mode === 'angles') {
      router.push('/detail-angles');
      return;
    }
    if (source === 'camera') {
      router.push('/capture');
      return;
    }
    void pickSingleFromGallery();
  };

  // La source ne s'applique qu'au mode « Une seule photo » (B et C gèrent la leur).
  const sourceRelevant = mode === 'single';

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader
        title={t('importHub.headerTitle')}
        right={<CreditBadge credits={me?.credits ?? 0} />}
      />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        <Text className="mt-2 font-heading-bold text-2xl text-ink">{t('importHub.heading')}</Text>
        <Text className="mt-1.5 font-body text-sm leading-5 text-gray2">
          {t('importHub.subtitle')}
        </Text>

        {/* 3 cartes de mode — sélection unique */}
        <View className="mt-6 gap-3">
          {modes.map((item) => {
            const selected = mode === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityState={{ selected }}
                onPress={() => setMode(item.value)}
                className={`flex-row items-center gap-4 rounded-3xl border px-4 py-4 ${
                  selected ? 'border-ink bg-ink' : 'border-paper3 bg-white active:bg-paper2'
                }`}
              >
                <View
                  className={`h-12 w-12 items-center justify-center rounded-2xl ${
                    selected ? 'bg-white/10' : 'bg-paper2'
                  }`}
                >
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={selected ? colors.offwhite : colors.ink}
                  />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className={`font-body-bold text-sm ${
                        selected ? 'text-offwhite' : 'text-ink'
                      }`}
                    >
                      {item.title}
                    </Text>
                    {item.badge ? (
                      <Badge label={item.badge} variant={selected ? 'light' : 'dark'} />
                    ) : null}
                  </View>
                  <Text
                    className={`mt-0.5 font-body text-xs leading-4 ${
                      selected ? 'text-gray' : 'text-gray2'
                    }`}
                  >
                    {item.description}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'chevron-forward'}
                  size={20}
                  color={selected ? colors.offwhite : colors.gray}
                />
              </Pressable>
            );
          })}
        </View>

        {/* SOURCE — appareil photo / galerie (mode « Une seule photo ») */}
        <Text className="mb-3 mt-8 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
          {t('importHub.sourceLabel')}
        </Text>
        <View className={`flex-row gap-3 ${sourceRelevant ? '' : 'opacity-40'}`}>
          {(
            [
              { value: 'camera', icon: 'camera-outline', label: t('importHub.sourceCamera') },
              { value: 'gallery', icon: 'images-outline', label: t('importHub.sourceGallery') },
            ] as const
          ).map((item) => {
            const selected = source === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected, disabled: !sourceRelevant }}
                disabled={!sourceRelevant}
                onPress={() => setSource(item.value)}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border px-4 py-4 ${
                  selected ? 'border-ink bg-ink' : 'border-paper3 bg-white active:bg-paper2'
                }`}
              >
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={selected ? colors.offwhite : colors.ink}
                />
                <Text
                  className={`font-body-semibold text-sm ${
                    selected ? 'text-offwhite' : 'text-ink'
                  }`}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!sourceRelevant ? (
          <Text className="mt-2 font-body text-xs text-gray">
            {mode === 'angles'
              ? t('importHub.sourceHintAngles')
              : t('importHub.sourceHintDefault')}
          </Text>
        ) : null}
      </ScrollView>

      {/* CTA */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label={t('common.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}
