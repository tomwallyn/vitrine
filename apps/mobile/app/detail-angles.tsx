import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { useCaptureResult } from '@/lib/capture-result';
import { useRenderDraft, type UploadStatus } from '@/lib/render-draft';
import { uploadImageAsync } from '@/lib/upload';
import {
  colors,
  GENERATION_COST_CREDITS,
  type GenerationExtraImages,
  type MeResponse,
} from '@vitrine/shared';

/** Identifiants des 4 slots — `front` alimente la source, le reste extraImages. */
type SlotId = 'front' | 'back' | 'detail' | 'label';

const SLOTS: { id: SlotId; name: string; hint: string; required: boolean }[] = [
  { id: 'front', name: 'Avant', hint: 'Vue principale', required: true },
  { id: 'back', name: 'Arrière', hint: 'Dos du vêtement', required: false },
  { id: 'detail', name: 'Détail / matière', hint: 'Texture, motif', required: false },
  { id: 'label', name: 'Étiquette', hint: 'Composition, taille', required: false },
];

type SlotState = {
  localUri: string | null;
  publicUrl: string | null;
  objectPath: string | null;
  status: UploadStatus;
  error: string | null;
};

const EMPTY_SLOT: SlotState = {
  localUri: null,
  publicUrl: null,
  objectPath: null,
  status: 'idle',
  error: null,
};

/** 02b — ANGLES DU VÊTEMENT : 4 vues de la même pièce, comptées 1 seul visuel. */
export default function DetailAnglesScreen() {
  const router = useRouter();
  const api = useApi();
  const [slots, setSlots] = useState<Record<SlotId, SlotState>>({
    front: EMPTY_SLOT,
    back: EMPTY_SLOT,
    detail: EMPTY_SLOT,
    label: EMPTY_SLOT,
  });

  // Solde de crédits (header).
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  const patchSlot = (id: SlotId, patch: Partial<SlotState>) =>
    setSlots((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  /** Upload GCS d'une vue (kind=source : toutes sont des photos du vêtement). */
  const uploadSlot = (id: SlotId, localUri: string) => {
    patchSlot(id, { localUri, publicUrl: null, objectPath: null, status: 'uploading', error: null });
    uploadImageAsync(api, localUri, 'source')
      .then(({ publicUrl, objectPath }) =>
        patchSlot(id, { publicUrl, objectPath, status: 'done', error: null }),
      )
      .catch((err: unknown) =>
        patchSlot(id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Envoi impossible',
        }),
      );
  };

  /** Appareil photo : ouvre l'écran caméra custom de l'app (identité + confirmation). */
  const pickFromCamera = (id: SlotId) => {
    useCaptureResult.getState().request(`slot:${id}`);
    router.push('/capture?mode=return');
  };

  // Retour de l'écran caméra custom → upload de la photo dans le bon slot.
  const captureUri = useCaptureResult((s) => s.uri);
  useEffect(() => {
    if (!captureUri) return;
    const res = useCaptureResult.getState().takeFor('slot:');
    if (res) uploadSlot(res.target.slice('slot:'.length) as SlotId, res.uri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureUri]);

  const pickFromGallery = async (id: SlotId) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) uploadSlot(id, asset.uri);
  };

  /** Slot vide (ou remplacement) : choix caméra / galerie. */
  const chooseSource = (id: SlotId) => {
    const slot = SLOTS.find((s) => s.id === id);
    Alert.alert(slot ? `Vue « ${slot.name} »` : 'Ajouter une vue', 'Choisissez une source.', [
      { text: 'Prendre une photo', onPress: () => void pickFromCamera(id) },
      { text: 'Choisir dans la galerie', onPress: () => void pickFromGallery(id) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  /** Slot rempli : remplacer ou retirer la vue. */
  const onSlotPress = (id: SlotId) => {
    const state = slots[id];
    if (state.status === 'uploading') return;
    if (state.localUri && state.status !== 'error') {
      Alert.alert('Modifier cette vue', undefined, [
        { text: 'Remplacer', onPress: () => chooseSource(id) },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => setSlots((prev) => ({ ...prev, [id]: EMPTY_SLOT })),
        },
        { text: 'Annuler', style: 'cancel' },
      ]);
      return;
    }
    if (state.status === 'error' && state.localUri) {
      // Échec d'upload : réessaie le même fichier ou repart d'une autre source.
      Alert.alert('Envoi impossible', state.error ?? undefined, [
        { text: 'Réessayer', onPress: () => uploadSlot(id, state.localUri!) },
        { text: 'Changer de photo', onPress: () => chooseSource(id) },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => setSlots((prev) => ({ ...prev, [id]: EMPTY_SLOT })),
        },
      ]);
      return;
    }
    chooseSource(id);
  };

  const front = slots.front;
  const anyUploading = Object.values(slots).some((s) => s.status === 'uploading');
  const canContinue = front.status === 'done' && !!front.publicUrl && !anyUploading;

  /** Écrit le brouillon (source = AVANT, extraImages = vues remplies) → écran 03. */
  const onContinue = () => {
    if (!canContinue || !front.localUri || !front.publicUrl || !front.objectPath) return;

    const extraImages: GenerationExtraImages = {
      ...(slots.back.publicUrl ? { back: slots.back.publicUrl } : {}),
      ...(slots.detail.publicUrl ? { detail: slots.detail.publicUrl } : {}),
      ...(slots.label.publicUrl ? { label: slots.label.publicUrl } : {}),
    };

    const draft = useRenderDraft.getState();
    draft.startDraft(front.localUri);
    draft.setSourceUploaded(front.publicUrl, front.objectPath);
    draft.setExtraImages(Object.values(extraImages).some(Boolean) ? extraImages : null);
    router.push('/render-config');
  };

  const continueLabel = anyUploading
    ? 'Envoi des vues…'
    : `Continuer · ${GENERATION_COST_CREDITS} crédit`;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader
        title="Angles du vêtement"
        right={<CreditBadge credits={me?.credits ?? 0} />}
      />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        <Text className="mt-2 font-body text-sm leading-5 text-gray2">
          Ajoutez plusieurs vues de la même pièce. L&apos;IA les combine pour un rendu plus juste.
        </Text>

        {/* 4 slots nommés — grille 2 × 2 */}
        <View className="mt-5 flex-row flex-wrap justify-between">
          {SLOTS.map((slot) => {
            const state = slots[slot.id];
            const filled = !!state.localUri;
            return (
              <Pressable
                key={slot.id}
                accessibilityRole="button"
                accessibilityLabel={`Vue ${slot.name}${slot.required ? ' (obligatoire)' : ''}`}
                onPress={() => onSlotPress(slot.id)}
                className="mb-4 w-[48%]"
              >
                <View
                  className={`aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border ${
                    filled && state.status !== 'error'
                      ? 'border-paper3 bg-paper2'
                      : 'border-dashed border-paper3 bg-paper2 active:bg-paper3'
                  }`}
                >
                  {state.localUri ? (
                    <Image
                      source={{ uri: state.localUri }}
                      className="absolute h-full w-full"
                      resizeMode="cover"
                      accessibilityLabel={`Photo ${slot.name}`}
                    />
                  ) : null}

                  {state.status === 'uploading' ? (
                    <View className="items-center rounded-2xl bg-ink/50 px-4 py-3">
                      <ActivityIndicator size="small" color={colors.offwhite} />
                      <Text className="mt-1.5 font-body-semibold text-xs text-offwhite">
                        Envoi…
                      </Text>
                    </View>
                  ) : state.status === 'error' ? (
                    <View className="items-center rounded-2xl bg-ink/60 px-3 py-3">
                      <Ionicons name="alert-circle-outline" size={20} color={colors.offwhite} />
                      <Text className="mt-1 text-center font-body-semibold text-xs text-offwhite">
                        Envoi impossible
                      </Text>
                      <Text className="mt-0.5 font-body text-[10px] text-offwhite underline">
                        Appuyez pour réessayer
                      </Text>
                    </View>
                  ) : state.status === 'done' ? (
                    <View className="absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full bg-ink">
                      <Ionicons name="checkmark" size={14} color={colors.offwhite} />
                    </View>
                  ) : (
                    <View className="items-center px-3">
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-white">
                        <Ionicons name="add" size={18} color={colors.ink} />
                      </View>
                      <Text className="mt-2 font-body-semibold text-xs text-ink">+ Ajouter</Text>
                      <Text className="mt-0.5 text-center font-body text-[10px] text-gray">
                        {slot.hint}
                      </Text>
                    </View>
                  )}
                </View>
                <View className="mt-1.5 flex-row items-center gap-1">
                  <Text className="font-body-bold text-[10px] uppercase tracking-[2px] text-gray2">
                    {slot.name}
                  </Text>
                  {slot.required ? (
                    <Text className="font-body text-[10px] text-gray">· obligatoire</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Bandeau — le lot de vues = 1 seul crédit */}
        <View className="flex-row items-center gap-2.5 rounded-2xl border border-paper3 bg-paper2 px-4 py-3">
          <Ionicons name="information-circle-outline" size={18} color={colors.gray3} />
          <Text className="flex-1 font-body text-xs leading-4 text-gray2">
            L&apos;ensemble compte comme 1 seul visuel.
          </Text>
        </View>
      </ScrollView>

      {/* CTA — actif seulement quand la vue AVANT est envoyée */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label={continueLabel} disabled={!canContinue} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}
