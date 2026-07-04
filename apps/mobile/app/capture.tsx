import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApi } from '@/lib/api';
import { useCaptureResult } from '@/lib/capture-result';
import { useRenderDraft } from '@/lib/render-draft';
import { uploadImageAsync } from '@/lib/upload';
import { colors } from '@vitrine/shared';

const FLASH_SEQUENCE: FlashMode[] = ['auto', 'on', 'off'];
const FLASH_LABELS: Record<FlashMode, string> = { auto: 'Auto', on: 'On', off: 'Off' };

/** 02 — PHOTOGRAPHIER : preview expo-camera plein écran + import galerie. */
export default function CaptureScreen() {
  const router = useRouter();
  const api = useApi();
  // mode 'return' : caméra réutilisée par multi-détails / lot → rend la photo.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  // fullScreenModal : on applique les insets à la main (SafeAreaView peut
  // rapporter des insets nuls au premier rendu dans un modal plein écran).
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const subjectType = useRenderDraft((s) => s.subjectType);
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [busy, setBusy] = useState(false);
  // Photo prise en attente de confirmation (affichée en grand : Valider/Reprendre).
  const [preview, setPreview] = useState<string | null>(null);

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
    router.push(draft.subjectType === 'objet' ? '/object-config' : '/render-config');

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
      // On ne continue pas tout de suite : on affiche la photo pour vérification.
      if (photo?.uri) setPreview(photo.uri);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Photo prête (validée après confirmation, ou choisie en galerie) :
   * - mode 'return' (multi-détails / lot) → rend l'URI à l'écran appelant ;
   * - sinon (flux « une photo ») → brouillon + upload + écran 03.
   */
  const onPhotoReady = (uri: string) => {
    if (mode === 'return') {
      useCaptureResult.getState().deliver(uri);
      router.back();
      return;
    }
    startDraftAndUpload(uri);
  };

  /** « Valider » : confirme la photo prévisualisée. */
  const validatePhoto = () => {
    if (!preview) return;
    const uri = preview;
    setPreview(null);
    onPhotoReady(uri);
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
      if (!result.canceled && asset) onPhotoReady(asset.uri);
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
      <View className="flex-1 bg-ink" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            onPress={() => router.back()}
            hitSlop={12}
            className="h-11 w-11 items-center justify-center rounded-full bg-gray3/60 active:bg-gray3/80"
          >
            <Ionicons name="close" size={24} color={colors.offwhite} />
          </Pressable>
          <Text className="font-heading text-sm uppercase tracking-[2px] text-offwhite">
            Photographier
          </Text>
          <View className="w-11" />
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
      </View>
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

      <View className="flex-1" style={{ paddingTop: insets.top }}>
        {/* Header : fermer · titre · flash ⚡ Auto — sous l'encoche/Dynamic Island */}
        <View className="flex-row items-center justify-between px-5 py-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            onPress={() => router.back()}
            hitSlop={12}
            className="h-11 w-11 items-center justify-center rounded-full bg-ink/60 active:bg-ink/80"
          >
            <Ionicons name="close" size={24} color={colors.offwhite} />
          </Pressable>
          <Text className="font-heading text-sm uppercase tracking-[2px] text-offwhite">
            Photographier
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Flash : ${FLASH_LABELS[flash]}`}
            onPress={cycleFlash}
            hitSlop={8}
            className="h-11 min-w-[44px] flex-row items-center justify-center rounded-full bg-ink/60 px-4 active:bg-ink/80"
          >
            <Text className="font-body-bold text-xs text-offwhite">⚡ {FLASH_LABELS[flash]}</Text>
          </Pressable>
        </View>

        {/* Guide de cadrage */}
        <View className="flex-1 items-center justify-center px-8">
          <View className="aspect-[3/4] w-full rounded-3xl border-2 border-dashed border-offwhite/60" />
          <View className="mt-4 rounded-full bg-ink/60 px-4 py-2">
            <Text className="text-center font-body-medium text-xs text-offwhite">
              {subjectType === 'objet'
                ? 'Placez l’objet bien centré, fond dégagé'
                : 'Placez le vêtement bien à plat, cintre centré'}
            </Text>
          </View>
        </View>

        {/* Contrôles bas : galerie · obturateur · switch cam — au-dessus de la home bar */}
        <View
          className="flex-row items-center justify-around px-10 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        >
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
      </View>

      {/* Confirmation : la photo prise s'affiche en grand → Reprendre / Valider */}
      {preview ? (
        <View style={StyleSheet.absoluteFill} className="bg-ink">
          <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          <View className="flex-1" style={{ paddingTop: insets.top }}>
            <View className="flex-row items-center justify-between px-5 py-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reprendre la photo"
                onPress={() => setPreview(null)}
                hitSlop={12}
                className="h-11 w-11 items-center justify-center rounded-full bg-ink/60 active:bg-ink/80"
              >
                <Ionicons name="close" size={24} color={colors.offwhite} />
              </Pressable>
              <Text className="font-heading text-sm uppercase tracking-[2px] text-offwhite">
                Vérifier la photo
              </Text>
              <View className="w-11" />
            </View>

            <View className="flex-1" />

            <View
              className="flex-row gap-3 px-5 pt-4"
              style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => setPreview(null)}
                className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-full border border-offwhite/70 active:opacity-80"
              >
                <Ionicons name="camera-reverse-outline" size={18} color={colors.offwhite} />
                <Text className="font-heading text-base tracking-wide text-offwhite">Reprendre</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={validatePhoto}
                className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-full bg-offwhite active:opacity-80"
              >
                <Ionicons name="checkmark" size={18} color={colors.ink} />
                <Text className="font-heading text-base tracking-wide text-ink">Valider</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
