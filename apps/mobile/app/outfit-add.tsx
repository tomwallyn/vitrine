import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useApi } from '@/lib/api';
import { useCaptureResult } from '@/lib/capture-result';
import { SLOT_LABEL } from '@/lib/outfit';
import { uploadImageAsync } from '@/lib/upload';
import { useOutfitTarget, type OutfitTarget } from '@/lib/use-outfit-target';
import { colors, garmentSlotSchema } from '@vitrine/shared';

/** MODÈLE·3 — « Ajouter une pièce » : photo/galerie + enregistrement garde-robe. */
export default function OutfitAddScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ slot?: string; target?: OutfitTarget }>();
  const slot = garmentSlotSchema.catch('bas').parse(params.slot);
  const target = params.target ?? 'single';
  const ctrl = useOutfitTarget(target);

  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [saveToWardrobe, setSaveToWardrobe] = useState(true);

  // Retour de la caméra custom → photo de la pièce.
  const captureUri = useCaptureResult((s) => s.uri);
  useEffect(() => {
    if (!captureUri) return;
    const res = useCaptureResult.getState().takeFor('garment');
    if (res) setPickedUri(res.uri);
  }, [captureUri]);

  const fromCamera = () => {
    useCaptureResult.getState().request('garment');
    router.push('/capture?mode=return');
  };
  const fromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) setPickedUri(asset.uri);
  };

  /**
   * Ajoute la pièce à la tenue : on la pose en `uploading` (vignette locale),
   * on revient à « La tenue », puis l'upload + l'enregistrement garde-robe se
   * terminent en arrière-plan (le CTA « Générer » attend la fin de l'upload).
   */
  const addToOutfit = () => {
    if (!pickedUri) return;
    const uri = pickedUri;
    const setPiece = ctrl.setOutfitPiece;
    setPiece(slot, { url: null, thumbUrl: uri, status: 'uploading' });
    router.dismissTo('/outfit');

    uploadImageAsync(api, uri, 'garment')
      .then(async ({ publicUrl }) => {
        setPiece(slot, { url: publicUrl, thumbUrl: uri, status: 'done' });
        if (saveToWardrobe) {
          try {
            await api.garments.create({
              imageUrl: publicUrl,
              slot,
              name: `${SLOT_LABEL[slot]} du ${new Date().toLocaleDateString('fr-FR')}`,
            });
            await queryClient.invalidateQueries({ queryKey: ['garments', slot] });
          } catch {
            // Enregistrement garde-robe best-effort : la tenue reste utilisable.
          }
        }
      })
      .catch(() => setPiece(slot, { url: null, thumbUrl: uri, status: 'error' }));
  };

  return (
    <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(17,16,15,0.55)' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fermer"
        onPress={() => router.back()}
        style={StyleSheet.absoluteFill}
      />

      <View className="rounded-t-[30px] bg-paper px-5 pb-9 pt-3">
        <View className="mb-4 h-1 w-10 self-center rounded-full bg-paper3" />

        <Text className="font-heading text-lg text-ink">Ajouter une pièce</Text>
        <Text className="mt-1 font-body text-[12px] leading-4 text-gray">
          Photographiez ou importez le {SLOT_LABEL[slot].toLowerCase()} à faire porter au mannequin.
        </Text>

        {/* Source : photo (caméra custom) ou galerie */}
        {pickedUri ? (
          <View className="mt-4 flex-row items-center gap-3 rounded-2xl border border-paper3 bg-white p-3">
            <Image source={{ uri: pickedUri }} className="h-16 w-16 rounded-xl bg-paper2" resizeMode="cover" />
            <Text className="flex-1 font-body-semibold text-[13px] text-ink">Pièce prête</Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPickedUri(null)}>
              <Text className="font-body-bold text-[12px] text-gray underline">Changer</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-4 flex-row gap-2.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Photo"
              onPress={fromCamera}
              className="h-24 flex-1 items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-gray bg-white"
            >
              <Ionicons name="camera-outline" size={24} color={colors.ink} />
              <Text className="font-body-bold text-[11px] text-ink">Photo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Galerie"
              onPress={fromGallery}
              className="h-24 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-paper3 bg-white"
            >
              <Ionicons name="image-outline" size={24} color={colors.ink} />
              <Text className="font-body-bold text-[11px] text-ink">Galerie</Text>
            </Pressable>
          </View>
        )}

        {/* Enregistrer dans la garde-robe */}
        <View className="mt-4 flex-row items-center gap-3 rounded-2xl border border-paper3 bg-white p-3">
          <Ionicons name="bookmark-outline" size={18} color={colors.ink} />
          <View className="flex-1">
            <Text className="font-body-bold text-[12.5px] text-ink">Enregistrer dans ma garde-robe</Text>
            <Text className="mt-0.5 font-body text-[10.5px] text-gray">
              Réutilisable pour vos prochains visuels
            </Text>
          </View>
          <Switch
            value={saveToWardrobe}
            onValueChange={setSaveToWardrobe}
            trackColor={{ true: colors.ink, false: colors.paper3 }}
            thumbColor={colors.offwhite}
          />
        </View>

        <Button
          label="Ajouter à la tenue"
          onPress={addToOutfit}
          disabled={!pickedUri}
          className="mt-5"
        />
      </View>
    </View>
  );
}
