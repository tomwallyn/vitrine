import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, Image, PixelRatio, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { fontFamilies, type Generation } from '@vitrine/shared';

/** Bord le plus long de l'image exportée (px) — évite les captures géantes. */
const MAX_EXPORT_EDGE = 1440;

/** `Image.getSize` promisifié (fonctionne sur les file:// locaux). */
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => reject(new Error("Dimensions de l'image illisibles")),
    );
  });
}

/** Télécharge le rendu dans le cache local (préalable au partage/enregistrement). */
async function downloadResult(generation: Generation): Promise<string> {
  if (!generation.resultImageUrl) throw new Error('Rendu indisponible');
  const target = `${FileSystem.cacheDirectory}vitrine-${generation.id}.jpg`;
  const download = await FileSystem.downloadAsync(generation.resultImageUrl, target);
  if (download.status !== 200) {
    throw new Error(`Téléchargement du rendu impossible (${download.status})`);
  }
  return download.uri;
}

type WatermarkJob = {
  uri: string;
  /** Taille logique (points) de la vue offscreen. */
  width: number;
  height: number;
  /** Taille de sortie (px) passée à captureRef. */
  outWidth: number;
  outHeight: number;
};

type PendingCapture = {
  resolve: (uri: string) => void;
  reject: (err: Error) => void;
};

/**
 * Filigrane « VITRINE » : l'image est rendue dans une vue offscreen
 * (hors écran, non interactive) surmontée d'un badge discret, puis capturée
 * en JPEG via react-native-view-shot. Retourne l'URI du fichier filigrané.
 */
function useWatermark(): {
  applyWatermark: (uri: string) => Promise<string>;
  watermarkOverlay: ReactNode;
} {
  const [job, setJob] = useState<WatermarkJob | null>(null);
  const pendingRef = useRef<PendingCapture | null>(null);
  const shotRef = useRef<View>(null);

  const applyWatermark = useCallback(async (uri: string): Promise<string> => {
    if (pendingRef.current) throw new Error('Un export est déjà en cours');
    const { width, height } = await getImageSize(uri);
    const scale = Math.min(1, MAX_EXPORT_EDGE / Math.max(width, height));
    const outWidth = Math.round(width * scale);
    const outHeight = Math.round(height * scale);
    const pixelRatio = PixelRatio.get();
    return new Promise<string>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      setJob({
        uri,
        width: outWidth / pixelRatio,
        height: outHeight / pixelRatio,
        outWidth,
        outHeight,
      });
    });
  }, []);

  const settle = useCallback((result: { uri: string } | { error: Error }) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setJob(null);
    if (!pending) return;
    if ('uri' in result) pending.resolve(result.uri);
    else pending.reject(result.error);
  }, []);

  const onImageLoaded = useCallback(async () => {
    const current = job;
    if (!current) return;
    try {
      // Laisse une frame au rendu natif avant la capture.
      await new Promise((r) => setTimeout(r, 32));
      const uri = await captureRef(shotRef, {
        format: 'jpg',
        quality: 0.92,
        result: 'tmpfile',
        width: current.outWidth,
        height: current.outHeight,
      });
      settle({ uri });
    } catch (err) {
      settle({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  }, [job, settle]);

  // Tailles du badge proportionnelles à la vue (conservées par la capture).
  const fontSize = job ? Math.max(10, job.width * 0.04) : 0;
  const pad = job ? Math.max(8, job.width * 0.045) : 0;

  const watermarkOverlay: ReactNode = job ? (
    <View
      ref={shotRef}
      collapsable={false}
      pointerEvents="none"
      style={{ position: 'absolute', left: -9999, top: 0, width: job.width, height: job.height }}
    >
      <Image
        source={{ uri: job.uri }}
        fadeDuration={0}
        resizeMode="cover"
        style={{ width: '100%', height: '100%' }}
        onLoad={() => void onImageLoaded()}
        onError={() => settle({ error: new Error('Chargement du rendu impossible') })}
      />
      <View
        style={{
          position: 'absolute',
          right: pad,
          bottom: pad,
          borderRadius: fontSize,
          backgroundColor: 'rgba(17,17,17,0.45)',
          paddingHorizontal: fontSize * 0.7,
          paddingVertical: fontSize * 0.35,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamilies.headingBold,
            fontSize,
            letterSpacing: fontSize * 0.14,
            color: 'rgba(255,255,255,0.95)',
          }}
        >
          VITRINE
        </Text>
      </View>
    </View>
  ) : null;

  return { applyWatermark, watermarkOverlay };
}

/**
 * Export du rendu (écran 05) : téléchargement + filigrane éventuel
 * (`settings.watermark`) + partage (expo-sharing) ou enregistrement
 * (expo-media-library). `watermarkOverlay` doit être rendu par l'écran hôte.
 */
export function useResultExport(watermarkEnabled: boolean): {
  share: (generation: Generation) => Promise<void>;
  saveToPhotos: (generation: Generation) => Promise<void>;
  exporting: boolean;
  watermarkOverlay: ReactNode;
} {
  const { applyWatermark, watermarkOverlay } = useWatermark();
  const [exporting, setExporting] = useState(false);

  /** URI prête à exporter : rendu brut, ou filigrané si le réglage est actif. */
  const prepareExportUri = useCallback(
    async (generation: Generation): Promise<string> => {
      const raw = await downloadResult(generation);
      return watermarkEnabled ? applyWatermark(raw) : raw;
    },
    [watermarkEnabled, applyWatermark],
  );

  const share = useCallback(
    async (generation: Generation) => {
      setExporting(true);
      try {
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert('Partage indisponible', "Le partage n'est pas disponible sur cet appareil.");
          return;
        }
        const uri = await prepareExportUri(generation);
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Exporter le visuel',
        });
      } catch (err) {
        Alert.alert(
          'Export impossible',
          err instanceof Error ? err.message : 'Réessayez dans un instant.',
        );
      } finally {
        setExporting(false);
      }
    },
    [prepareExportUri],
  );

  const saveToPhotos = useCallback(
    async (generation: Generation) => {
      setExporting(true);
      try {
        const permission = await MediaLibrary.requestPermissionsAsync(true);
        if (!permission.granted) {
          Alert.alert(
            'Accès refusé',
            "Autorisez l'accès aux photos dans les réglages pour enregistrer vos visuels.",
          );
          return;
        }
        const uri = await prepareExportUri(generation);
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Enregistré', 'Le visuel a été ajouté à votre photothèque.');
      } catch (err) {
        Alert.alert(
          'Enregistrement impossible',
          err instanceof Error ? err.message : 'Réessayez dans un instant.',
        );
      } finally {
        setExporting(false);
      }
    },
    [prepareExportUri],
  );

  return { share, saveToPhotos, exporting, watermarkOverlay };
}
