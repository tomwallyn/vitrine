import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { colors, type MeResponse, type UpdateMeRequest } from '@vitrine/shared';

/** Ma boutique — édition du nom et de la ville (PATCH /me). */
export default function MyShopScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Pré-remplit le formulaire une fois le shop chargé.
  useEffect(() => {
    if (data?.shop && !hydrated) {
      setName(data.shop.name);
      setCity(data.shop.city ?? '');
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
    if (!name.trim() || mutation.isPending) return;
    mutation.mutate({ name: name.trim(), city: city.trim() || null });
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Ma boutique" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1 px-6" contentContainerClassName="pt-6 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="font-heading-bold text-3xl text-ink">Votre vitrine.</Text>
          <Text className="mt-2 font-body text-base text-gray2">
            Le nom et la ville apparaissent sur votre profil et vos exports.
          </Text>

          {isPending && !hydrated ? (
            <View className="mt-10 items-center">
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : (
            <>
              <View className="mt-8 gap-3">
                <View>
                  <Text className="mb-2 font-body-semibold text-xs uppercase tracking-widest text-gray2">
                    Nom de la boutique
                  </Text>
                  <TextInput
                    placeholder="L'Atelier Nord"
                    placeholderTextColor={colors.gray}
                    value={name}
                    onChangeText={setName}
                    className="h-14 rounded-2xl border border-paper3 bg-white px-4 font-body text-base text-ink"
                  />
                </View>
                <View>
                  <Text className="mb-2 font-body-semibold text-xs uppercase tracking-widest text-gray2">
                    Ville
                  </Text>
                  <TextInput
                    placeholder="Lille"
                    placeholderTextColor={colors.gray}
                    value={city}
                    onChangeText={setCity}
                    className="h-14 rounded-2xl border border-paper3 bg-white px-4 font-body text-base text-ink"
                  />
                </View>
              </View>

              {mutation.isError ? (
                <Text className="mt-4 font-body-medium text-sm text-ink">
                  ⚠️ {mutation.error instanceof Error ? mutation.error.message : 'Enregistrement impossible.'}
                </Text>
              ) : null}

              <Button
                label={mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
                className="mt-8"
                disabled={!name.trim() || mutation.isPending}
                onPress={onSave}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
