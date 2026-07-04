import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useRenderDraft } from '@/lib/render-draft';
import { sceneReady } from '@/lib/scene';
import { colors, OBJECT_ACCESSORIES, OBJECT_SCENES, OBJECT_SURFACES } from '@vitrine/shared';

type SlotId = 'surface' | 'background' | 'accessoires';
const preset = (list: { key: string; name: string }[], key?: string | null) =>
  list.find((p) => p.key === key)?.name;

/** OBJET·2 — « La scène » : surface (requise) / arrière-plan / accessoires (optionnel). */
export default function SceneScreen() {
  const router = useRouter();
  const localUri = useRenderDraft((s) => s.localUri);
  const scene = useRenderDraft((s) => s.scene);
  const ready = sceneReady(scene);

  const SLOTS: { id: SlotId; label: string; required: boolean; icon: keyof typeof Ionicons.glyphMap; value: string; uploading?: boolean; thumb?: string | null }[] = [
    {
      id: 'surface',
      label: 'Surface',
      required: true,
      icon: 'apps-outline',
      value: preset(OBJECT_SURFACES, scene.surface) ?? 'À choisir',
    },
    {
      id: 'background',
      label: 'Arrière-plan',
      required: false,
      icon: 'image-outline',
      value: scene.decor?.url || scene.decor?.thumbUrl
        ? 'Décor perso'
        : (preset(OBJECT_SCENES, scene.background) ?? 'Studio par défaut'),
      uploading: scene.decor?.status === 'uploading',
      thumb: scene.decor?.thumbUrl ?? null,
    },
    {
      id: 'accessoires',
      label: 'Accessoires',
      required: false,
      icon: 'leaf-outline',
      value: preset(OBJECT_ACCESSORIES, scene.accessoires) ?? 'Aucun',
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="La scène" />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        <Text className="font-heading text-xl text-ink">Composez la scène</Text>
        <Text className="mt-1.5 font-body text-[12.5px] leading-5 text-gray">
          Votre objet sera mis en situation. Réglez le décor pour un rendu réaliste et vendeur.
        </Text>

        <View className="mt-6 gap-2.5">
          {/* Objet (verrouillé) */}
          <View className="flex-row items-center gap-3 rounded-2xl bg-ink p-3">
            <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-paper3">
              {localUri ? (
                <Image source={{ uri: localUri }} className="h-full w-full" resizeMode="cover" />
              ) : (
                <Ionicons name="cube-outline" size={20} color={colors.ink} />
              )}
            </View>
            <View className="flex-1">
              <Text className="font-heading text-[10px] uppercase tracking-[1.5px] text-gray">
                VOTRE OBJET
              </Text>
              <Text className="mt-0.5 font-body-bold text-[13px] text-offwhite">Objet importé</Text>
            </View>
            <Ionicons name="lock-closed" size={16} color={colors.offwhite} />
          </View>

          {/* Slots de scène */}
          {SLOTS.map((slot) => (
            <Pressable
              key={slot.id}
              accessibilityRole="button"
              accessibilityLabel={`${slot.label} — modifier`}
              onPress={() => router.push(`/scene-picker?slot=${slot.id}`)}
              className={`flex-row items-center gap-3 rounded-2xl bg-white p-3 ${
                slot.required && !scene.surface ? 'border-[1.5px] border-ink' : 'border border-paper3'
              }`}
            >
              <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-paper2">
                {slot.thumb ? (
                  <Image source={{ uri: slot.thumb }} className="h-full w-full" resizeMode="cover" />
                ) : (
                  <Ionicons name={slot.icon} size={20} color={colors.gray} />
                )}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="font-heading text-[10px] uppercase tracking-[1.5px] text-ink">
                    {slot.label}
                  </Text>
                  <View className={`rounded-full px-1.5 py-0.5 ${slot.required ? 'bg-ink' : 'bg-paper3'}`}>
                    <Text
                      className={`font-heading text-[8px] uppercase ${
                        slot.required ? 'text-offwhite' : 'text-gray'
                      }`}
                    >
                      {slot.required ? 'Requis' : 'Optionnel'}
                    </Text>
                  </View>
                </View>
                <Text className="mt-0.5 font-body-semibold text-[13px] text-gray">
                  {slot.uploading ? 'Envoi…' : slot.value}
                </Text>
              </View>
              {slot.uploading ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <Text className="font-body-bold text-[12px] text-ink underline">
                  {slot.id === 'surface' ? 'Choisir' : 'Changer'}
                </Text>
              )}
            </Pressable>
          ))}
        </View>

        {/* Hint Mes scènes */}
        <View className="mt-4 flex-row items-center gap-2.5 rounded-2xl bg-paper2 px-3 py-3">
          <Ionicons name="images-outline" size={18} color={colors.ink} />
          <Text className="flex-1 font-body text-[11.5px] leading-4 text-gray2">
            Réutilisez vos décors depuis <Text className="font-body-bold text-ink">Mes scènes</Text>.
          </Text>
        </View>
      </ScrollView>

      <View className="px-5 pb-2 pt-2">
        <Button
          label={ready ? 'Valider la scène' : 'Choisissez une surface pour continuer'}
          onPress={() => router.back()}
          disabled={!ready}
        />
      </View>
    </SafeAreaView>
  );
}
