import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { MannequinSelector } from '@/components/MannequinSelector';
import { RenderTypeSelector } from '@/components/RenderTypeSelector';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import {
  colors,
  type BackgroundOption,
  type MannequinOption,
  type MeResponse,
  type RenderType,
  type UpdateMeRequest,
} from '@vitrine/shared';

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-3 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
      {children}
    </Text>
  );
}

/**
 * Préréglages de rendu (menu Profil) : STYLE + MANNEQUIN + FOND appliqués
 * par défaut à chaque nouveau visuel (écran 03). Persisté dans
 * shop.settings.default* via PATCH /me.
 */
export default function RenderPresetsScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  const [renderType, setRenderType] = useState<RenderType>('model');
  const [mannequinOption, setMannequinOption] = useState<MannequinOption>('femme');
  const [backgroundOption, setBackgroundOption] = useState<BackgroundOption>('studio');
  const [hydrated, setHydrated] = useState(false);

  // Pré-remplit depuis les settings du shop, une seule fois.
  useEffect(() => {
    if (data?.shop && !hydrated) {
      const settings = data.shop.settings;
      setRenderType(settings.defaultRenderType ?? 'model');
      setMannequinOption(settings.defaultMannequinOption ?? 'femme');
      setBackgroundOption(settings.defaultBackgroundOption ?? 'studio');
      setHydrated(true);
    }
  }, [data, hydrated]);

  const mutation = useMutation({
    mutationFn: (body: UpdateMeRequest) => api.patch<MeResponse>('/me', body),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me);
      router.back();
    },
  });

  const onSave = () => {
    if (mutation.isPending) return;
    mutation.mutate({
      settings: {
        defaultRenderType: renderType,
        defaultMannequinOption: mannequinOption,
        defaultBackgroundOption: backgroundOption,
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Préréglages" />
      <ScrollView className="flex-1 px-5" contentContainerClassName="pt-2 pb-8">
        <Text className="font-heading-bold text-3xl text-ink">Vos défauts de rendu.</Text>
        <Text className="mt-2 font-body text-base text-gray2">
          Appliqués à chaque nouveau visuel — modifiables au moment du rendu.
        </Text>

        {isPending && !hydrated ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : (
          <>
            {/* STYLE DE VISUEL — 4 types */}
            <View className="mt-8">
              <SectionTitle>Style de visuel</SectionTitle>
              <RenderTypeSelector value={renderType} onChange={setRenderType} />
            </View>

            {/* MANNEQUIN — pertinent pour le rendu « Sur modèle » */}
            {renderType === 'model' ? (
              <View className="mt-6">
                <SectionTitle>Mannequin</SectionTitle>
                <MannequinSelector value={mannequinOption} onChange={setMannequinOption} />
              </View>
            ) : null}

            {/* FOND — studio / personnalisé */}
            <View className="mt-6">
              <SectionTitle>Fond</SectionTitle>
              <View className="flex-row gap-3">
                {(
                  [
                    { value: 'studio', label: 'Fond studio', hint: 'Crème, neutre' },
                    {
                      value: 'custom',
                      label: 'Personnalisé',
                      hint: 'À choisir parmi « Mes fonds »',
                    },
                  ] as const
                ).map((item) => {
                  const selected = backgroundOption === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setBackgroundOption(item.value)}
                      className={`flex-1 rounded-2xl border px-4 py-4 ${
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
                      <Text className="mt-1 font-body text-xs text-gray">{item.hint}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {backgroundOption === 'custom' ? (
                <Text className="mt-2 font-body text-xs text-gray2">
                  Le fond lui-même se sélectionne à chaque rendu (vos fonds enregistrés ou un
                  nouvel upload).
                </Text>
              ) : null}
            </View>

            {mutation.isError ? (
              <Text className="mt-4 font-body-medium text-sm text-ink">
                ⚠️{' '}
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : 'Enregistrement impossible.'}
              </Text>
            ) : null}

            <Button
              label={mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              className="mt-8"
              disabled={mutation.isPending || !data}
              onPress={onSave}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
