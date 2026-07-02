import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  colors,
  type BackgroundOption,
  type MannequinOption,
  type RenderType,
} from '@vitrine/shared';

const RENDER_STYLES: { value: RenderType; label: string; icon: string }[] = [
  { value: 'model', label: 'Sur modèle', icon: '🧍' },
  { value: 'hanger', label: 'Sur cintre', icon: '🧥' },
  { value: 'folded', label: 'Plié à plat', icon: '🗂️' },
  { value: 'studio', label: 'Fond studio', icon: '📦' },
];

const MANNEQUINS: { value: MannequinOption; label: string }[] = [
  { value: 'femme', label: 'Femme' },
  { value: 'homme', label: 'Homme' },
  { value: 'silhouette', label: 'Silhouette' },
  { value: 'studio', label: 'Studio' },
];

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-3 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
      {children}
    </Text>
  );
}

/** 03 — CHOISIR LE RENDU : STYLE · MANNEQUIN · FOND · Générer (1 crédit). */
export default function RenderConfigScreen() {
  const router = useRouter();
  const [style, setStyle] = useState<RenderType>('model');
  const [mannequin, setMannequin] = useState<MannequinOption>('femme');
  const [background, setBackground] = useState<BackgroundOption>('studio');

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Choisir le rendu" subtitle="Étape 2/3" />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Photo importée */}
        <View className="mb-6 h-44 flex-row items-center justify-center gap-3 rounded-3xl border border-paper3 bg-paper2">
          <Text className="text-4xl">🧥</Text>
          <View>
            <Text className="font-body-semibold text-sm text-ink">Photo importée</Text>
            <Text className="font-body text-xs text-gray">veste-coach.jpg</Text>
          </View>
        </View>

        {/* STYLE — 4 types de rendu */}
        <SectionTitle>Style</SectionTitle>
        <View className="mb-6 flex-row flex-wrap gap-3">
          {RENDER_STYLES.map((item) => {
            const selected = style === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                onPress={() => setStyle(item.value)}
                className={`w-[47%] items-center rounded-2xl border px-3 py-4 ${
                  selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
                }`}
              >
                <Text className="text-2xl">{item.icon}</Text>
                <Text
                  className={`mt-2 font-body-semibold text-sm ${
                    selected ? 'text-offwhite' : 'text-ink'
                  }`}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* MANNEQUIN — 4 options */}
        <SectionTitle>Mannequin</SectionTitle>
        <View className="mb-6 flex-row flex-wrap gap-2">
          {MANNEQUINS.map((item) => {
            const selected = mannequin === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                onPress={() => setMannequin(item.value)}
                className={`rounded-full border px-5 py-2.5 ${
                  selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
                }`}
              >
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

        {/* FOND — studio / personnalisé */}
        <SectionTitle>Fond</SectionTitle>
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => setBackground('studio')}
            className={`flex-1 rounded-2xl border px-4 py-4 ${
              background === 'studio' ? 'border-ink bg-ink' : 'border-paper3 bg-white'
            }`}
          >
            <Text
              className={`font-body-semibold text-sm ${
                background === 'studio' ? 'text-offwhite' : 'text-ink'
              }`}
            >
              Fond studio
            </Text>
            <Text className="mt-1 font-body text-xs text-gray">Crème, neutre</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setBackground('custom')}
            className={`flex-1 rounded-2xl border px-4 py-4 ${
              background === 'custom' ? 'border-ink bg-ink' : 'border-dashed border-paper3 bg-white'
            }`}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons
                name="add-circle-outline"
                size={16}
                color={background === 'custom' ? colors.offwhite : colors.ink}
              />
              <Text
                className={`font-body-semibold text-sm ${
                  background === 'custom' ? 'text-offwhite' : 'text-ink'
                }`}
              >
                Personnalisé
              </Text>
            </View>
            {/* TODO(M3): upload + fonds réutilisables (/backgrounds) */}
            <Text className="mt-1 font-body text-xs text-gray">Votre boutique, un mur…</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* CTA */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label="Générer · 1 crédit" onPress={() => router.push('/generating/demo')} />
      </View>
    </SafeAreaView>
  );
}
