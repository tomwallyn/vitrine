import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useApi } from '@/lib/api';
import { useCaptureResult } from '@/lib/capture-result';
import { useSceneTarget } from '@/lib/use-scene-target';
import { uploadImageAsync } from '@/lib/upload';
import { colors } from '@vitrine/shared';

/** OBJET — « Ajouter un décor » : photo/galerie + enregistrement dans « Mes scènes ». */
export default function SceneAddScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ target?: string }>();
  const target = params.target === 'batch' ? 'batch' : 'single';
  const { setScene } = useSceneTarget(target);

  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  // Retour de la caméra custom → photo du décor.
  const captureUri = useCaptureResult((s) => s.uri);
  useEffect(() => {
    if (!captureUri) return;
    const res = useCaptureResult.getState().takeFor('scene-decor');
    if (res) setPickedUri(res.uri);
  }, [captureUri]);

  const fromCamera = () => {
    useCaptureResult.getState().request('scene-decor');
    router.push('/capture?mode=return');
  };
  const fromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) setPickedUri(asset.uri);
  };

  const addToScene = () => {
    if (!pickedUri) return;
    const uri = pickedUri;
    setScene({ decor: { url: null, thumbUrl: uri, status: 'uploading' }, background: null });
    router.dismissTo(`/scene?target=${target}`);

    uploadImageAsync(api, uri, 'background')
      .then(async ({ publicUrl }) => {
        setScene({ decor: { url: publicUrl, thumbUrl: uri, status: 'done' }, background: null });
        if (saveToLibrary) {
          try {
            await api.backgrounds.create({
              imageUrl: publicUrl,
              name: `Décor du ${new Date().toLocaleDateString('fr-FR')}`,
            });
            await queryClient.invalidateQueries({ queryKey: ['backgrounds'] });
          } catch {
            // Enregistrement best-effort : la scène reste utilisable.
          }
        }
      })
      .catch(() => setScene({ decor: { url: null, thumbUrl: uri, status: 'error' }, background: null }));
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

        <Text className="font-heading text-lg text-ink">Ajouter un décor</Text>
        <Text className="mt-1 font-body text-[12px] leading-4 text-gray">
          Photographiez ou importez un arrière-plan où placer votre objet.
        </Text>

        {pickedUri ? (
          <View className="mt-4 flex-row items-center gap-3 rounded-2xl border border-paper3 bg-white p-3">
            <Image source={{ uri: pickedUri }} className="h-16 w-16 rounded-xl bg-paper2" resizeMode="cover" />
            <Text className="flex-1 font-body-semibold text-[13px] text-ink">Décor prêt</Text>
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

        <View className="mt-4 flex-row items-center gap-3 rounded-2xl border border-paper3 bg-white p-3">
          <Ionicons name="bookmark-outline" size={18} color={colors.ink} />
          <View className="flex-1">
            <Text className="font-body-bold text-[12.5px] text-ink">Enregistrer dans mes scènes</Text>
            <Text className="mt-0.5 font-body text-[10.5px] text-gray">
              Réutilisable pour vos prochains visuels
            </Text>
          </View>
          <Switch
            value={saveToLibrary}
            onValueChange={setSaveToLibrary}
            trackColor={{ true: colors.ink, false: colors.paper3 }}
            thumbColor={colors.offwhite}
          />
        </View>

        <Button label="Ajouter à la scène" onPress={addToScene} disabled={!pickedUri} className="mt-5" />
      </View>
    </View>
  );
}
