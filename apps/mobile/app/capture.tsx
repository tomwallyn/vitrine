import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApi } from '@/lib/api';
import { useRenderDraft } from '@/lib/render-draft';
import { uploadImageAsync } from '@/lib/upload';
import { colors } from '@vitrine/shared';

const FLASH_SEQUENCE: FlashMode[] = ['auto', 'on', 'off'];
const FLASH_LABELS: Record<FlashMode, string> = { auto: 'Auto', on: 'On', off: 'Off' };

/** 02 — PHOTOGRAPHIER : preview expo-camera plein écran + import galerie. */
export default function CaptureScreen() {
  const router = useRouter();
  const api = useApi();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [busy, setBusy] = useState(false);

  const cycleFlash = () => {
    setFlash((current) => {
      const index = FLASH_SEQUENCE.indexOf(current);
      return FLASH_SEQUENCE[(index + 1) % FLASH_SEQUENCE.length] ?? 'auto';
    });
  };

  /**
   * Photo prête (capture ou galerie) : démarre le brouillon, lance l'upload
   * GCS en arrière-plan (le store porte l'état) et passe à l'écran 03.
   */
  const startDraftAndUpload = (localUri: string) => {
    const draft = useRenderDraft.getState();
    draft.startDraft(localUri);
    draft.setSourceUploading();
    router.push('/render-config');

    uploadImageAsync(api, localUri, 'source')
      .then(({ publicUrl, objectPath }) =>
        useRenderDraft.getState().setSourceUploaded(publicUrl, objectPath),
      )
      .catch((err: unknown) =>
        useRenderDraft
          .getState()
          .setSourceUploadFailed(err instanceof Error ? err.message : 'Envoi impossible'),
      );
  };

  const takePicture = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) startDraftAndUpload(photo.uri);
    } finally {
      setBusy(false);
    }
  };

  const pickFromGallery = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.assets?.[0];
      if (!result.canceled && asset) startDraftAndUpload(asset.uri);
    } finally {
      setBusy(false);
    }
  };

  // ── Permission caméra ────────────────────────────────────────
  if (!permission) {
    return <View className="flex-1 bg-ink" />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-ink">
        <View className="flex-row items-center justify-between px-5 py-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-gray3/40"
          >
            <Ionicons name="close" size={20} color={colors.offwhite} />
          </Pressable>
          <Text className="font-heading text-sm uppercase tracking-[2px] text-offwhite">
            Photographier
          </Text>
          <View className="w-10" />
        </View>

        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="camera-outline" size={48} color={colors.gray} />
          <Text className="mt-6 text-center font-heading text-lg text-offwhite">
            Accès caméra requis
          </Text>
          <Text className="mt-2 text-center font-body text-sm leading-5 text-gray">
            VITRINE utilise la caméra pour photographier vos vêtements sur cintre.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (permission.canAskAgain) void requestPermission();
              else void Linking.openSettings();
            }}
            className="mt-8 h-14 items-center justify-center self-stretch rounded-full bg-offwhite px-8 active:opacity-80"
          >
            <Text className="font-heading text-base tracking-wide text-ink">
              {permission.canAskAgain ? 'Autoriser la caméra' : 'Ouvrir les réglages'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={pickFromGallery} className="mt-4 py-2">
            <Text className="font-body-semibold text-sm text-gray underline">
              Importer depuis la galerie
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Preview plein écran + overlays ───────────────────────────
  return (
    <View className="flex-1 bg-ink">
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
      />

      <SafeAreaView className="flex-1">
        {/* Header : fermer · titre · flash ⚡ Auto */}
        <View className="flex-row items-center justify-between px-5 py-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-ink/50"
          >
            <Ionicons name="close" size={20} color={colors.offwhite} />
          </Pressable>
          <Text className="font-heading text-sm uppercase tracking-[2px] text-offwhite">
            Photographier
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Flash : ${FLASH_LABELS[flash]}`}
            onPress={cycleFlash}
            className="h-10 flex-row items-center justify-center rounded-full bg-ink/50 px-3"
          >
            <Text className="font-body-bold text-xs text-offwhite">⚡ {FLASH_LABELS[flash]}</Text>
          </Pressable>
        </View>

        {/* Guide de cadrage */}
        <View className="flex-1 items-center justify-center px-8">
          <View className="aspect-[3/4] w-full rounded-3xl border-2 border-dashed border-offwhite/60" />
          <View className="mt-4 rounded-full bg-ink/60 px-4 py-2">
            <Text className="text-center font-body-medium text-xs text-offwhite">
              Placez le vêtement bien à plat, cintre centré
            </Text>
          </View>
        </View>

        {/* Contrôles bas : galerie · obturateur · switch cam */}
        <View className="flex-row items-center justify-around px-10 pb-8 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Importer depuis la galerie"
            onPress={pickFromGallery}
            className="h-12 w-12 items-center justify-center rounded-full bg-ink/50 active:opacity-70"
          >
            <Ionicons name="images-outline" size={20} color={colors.offwhite} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Prendre la photo"
            onPress={takePicture}
            disabled={busy}
            className="h-20 w-20 items-center justify-center rounded-full border-4 border-offwhite active:opacity-80"
          >
            {busy ? (
              <ActivityIndicator color={colors.offwhite} />
            ) : (
              <View className="h-16 w-16 rounded-full bg-offwhite" />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Changer de caméra"
            onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
            className="h-12 w-12 items-center justify-center rounded-full bg-ink/50 active:opacity-70"
          >
            <Ionicons name="camera-reverse-outline" size={20} color={colors.offwhite} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
