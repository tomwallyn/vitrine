import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { garmentTypeLabel, slotLabel } from '@/lib/i18n/labels';
import {
  completionSlots,
  outfitUploading,
  requiredSlotFilled,
} from '@/lib/outfit';
import { useRenderDraft } from '@/lib/render-draft';
import { useOutfitTarget, type OutfitTarget } from '@/lib/use-outfit-target';
import { colors, GARMENT_TYPES, type GarmentSlot } from '@vitrine/shared';

const SLOT_ICON: Record<GarmentSlot, keyof typeof Ionicons.glyphMap> = {
  haut: 'shirt-outline',
  bas: 'shirt-outline',
  chaussures: 'footsteps-outline',
};

/** MODÈLE·1 — « La tenue » : type de la pièce + complétion (bas/haut/chaussures). */
export default function OutfitScreen() {
  const router = useRouter();
  const { target = 'single' } = useLocalSearchParams<{ target?: OutfitTarget }>();
  const ctrl = useOutfitTarget(target);
  const api = useApi();

  // Auto-détection du type de la pièce importée (photo unique), sauf choix manuel.
  const [detecting, setDetecting] = useState(false);
  const classifiedRef = useRef(false);
  useEffect(() => {
    if (target !== 'single' || classifiedRef.current) return;
    const draft = useRenderDraft.getState();
    if (draft.garmentTypeTouched || !draft.sourceUrl) return;
    classifiedRef.current = true;
    setDetecting(true);
    api.garments
      .classify(draft.sourceUrl)
      .then((res) => useRenderDraft.getState().setGarmentTypeAuto(res.garmentType))
      .catch(() => {})
      .finally(() => setDetecting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slots = completionSlots(ctrl.garmentType);
  const requiredSlot = slots.find((s) => s.required)?.slot;
  const canFinish = requiredSlotFilled(ctrl.garmentType, ctrl.outfit) && !outfitUploading(ctrl.outfit);
  const ctaLabel = canFinish
    ? t('outfit.ctaValidate')
    : t('outfit.ctaChoose', {
        slot: requiredSlot ? slotLabel(requiredSlot).toLowerCase() : t('outfit.genericElement'),
      });

  const openPicker = (slot: GarmentSlot) =>
    router.push(`/outfit-picker?slot=${slot}&target=${target}`);

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={t('outfit.title')} />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        <Text className="font-heading text-xl text-ink">{t('outfit.heading')}</Text>
        <Text className="mt-1.5 font-body text-[12.5px] leading-5 text-gray">
          {t('outfit.subtitle')}
        </Text>

        {/* Type générique de la pièce importée — deviné (auto), corrigeable en 1 clic */}
        <View className="mb-2 mt-6 flex-row items-center gap-2">
          <Text className="font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
            {t('outfit.yourPieceLabel')}
          </Text>
          {detecting ? (
            <>
              <ActivityIndicator size="small" color={colors.gray} />
              <Text className="font-body text-[10px] text-gray">{t('outfit.detecting')}</Text>
            </>
          ) : null}
        </View>
        <View className="flex-row gap-2">
          {GARMENT_TYPES.map((type) => {
            const selected = ctrl.garmentType === type;
            return (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => ctrl.setGarmentType(type)}
                className={`flex-1 items-center rounded-full border py-2.5 ${
                  selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
                }`}
              >
                <Text
                  className={`font-body-semibold text-[13px] ${
                    selected ? 'text-offwhite' : 'text-ink'
                  }`}
                >
                  {garmentTypeLabel(type)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Slots de la tenue */}
        <View className="mt-6 gap-2.5">
          {/* Pièce importée (verrouillée) */}
          <View className="flex-row items-center gap-3 rounded-2xl bg-ink p-3">
            <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-paper3">
              {ctrl.sourceThumb ? (
                <Image
                  source={{ uri: ctrl.sourceThumb }}
                  className="h-full w-full"
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="shirt-outline" size={20} color={colors.ink} />
              )}
            </View>
            <View className="flex-1">
              <Text className="font-heading text-[10px] uppercase tracking-[1.5px] text-gray">
                {garmentTypeLabel(ctrl.garmentType).toUpperCase()} · {t('outfit.yourPieceUpper')}
              </Text>
              <Text className="mt-0.5 font-body-bold text-[13px] text-offwhite">
                {target === 'batch' ? t('outfit.batchPieces') : t('outfit.importedPiece')}
              </Text>
            </View>
            <Ionicons name="lock-closed" size={16} color={colors.offwhite} />
          </View>

          {/* Slots à compléter */}
          {slots.map(({ slot, required }) => {
            const piece = ctrl.outfit[slot];
            const uploading = piece?.status === 'uploading';
            return (
              <Pressable
                key={slot}
                accessibilityRole="button"
                accessibilityLabel={
                  piece?.url
                    ? t('outfit.slotEditA11y', { slot: slotLabel(slot) })
                    : t('outfit.slotChooseA11y', { slot: slotLabel(slot) })
                }
                onPress={() => openPicker(slot)}
                className={`flex-row items-center gap-3 rounded-2xl bg-white p-3 ${
                  required && !piece?.url ? 'border-[1.5px] border-ink' : 'border border-paper3'
                }`}
              >
                <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-paper2">
                  {piece?.thumbUrl ? (
                    <Image
                      source={{ uri: piece.thumbUrl }}
                      className="h-full w-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name={SLOT_ICON[slot]} size={20} color={colors.gray} />
                  )}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="font-heading text-[10px] uppercase tracking-[1.5px] text-ink">
                      {slotLabel(slot)}
                    </Text>
                    <View className={`rounded-full px-1.5 py-0.5 ${required ? 'bg-ink' : 'bg-paper3'}`}>
                      <Text
                        className={`font-heading text-[8px] uppercase ${
                          required ? 'text-offwhite' : 'text-gray'
                        }`}
                      >
                        {required ? t('outfit.required') : t('outfit.optional')}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-0.5 font-body-semibold text-[13px] text-gray">
                    {uploading
                      ? t('outfit.statusUploading')
                      : piece?.status === 'error'
                        ? t('outfit.statusError')
                        : piece?.url
                          ? t('outfit.statusSelected')
                          : required
                            ? t('outfit.statusToChoose')
                            : t('outfit.statusNone')}
                  </Text>
                </View>
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : piece?.url ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('outfit.removeSlotA11y', { slot: slotLabel(slot) })}
                    hitSlop={8}
                    onPress={() => ctrl.clearOutfitPiece(slot)}
                  >
                    <Text className="font-body-bold text-[12px] text-gray underline">
                      {t('common.remove')}
                    </Text>
                  </Pressable>
                ) : (
                  <Text className="font-body-bold text-[12px] text-ink underline">
                    {required ? t('outfit.choose') : t('common.add')}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Hint garde-robe */}
        <View className="mt-4 flex-row items-center gap-2.5 rounded-2xl bg-paper2 px-3 py-3">
          <Ionicons name="file-tray-full-outline" size={18} color={colors.ink} />
          <Text className="flex-1 font-body text-[11.5px] leading-4 text-gray2">
            {t('outfit.wardrobeHint')}{' '}
            <Text className="font-body-bold text-ink">{t('outfit.wardrobeName')}</Text>.
          </Text>
        </View>
      </ScrollView>

      <View className="px-5 pb-2 pt-2">
        <Button label={ctaLabel} onPress={() => router.back()} disabled={!canFinish} />
      </View>
    </SafeAreaView>
  );
}
