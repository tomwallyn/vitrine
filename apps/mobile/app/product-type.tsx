import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { t } from '@/lib/i18n';
import { useRenderDraft } from '@/lib/render-draft';
import { colors, type SubjectType } from '@vitrine/shared';

const OPTIONS: {
  value: SubjectType;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
}[] = [
  {
    value: 'vetement',
    label: t('productType.clothingLabel'),
    sub: t('productType.clothingSub'),
    icon: 'shirt-outline',
  },
  {
    value: 'objet',
    label: t('productType.objectLabel'),
    sub: t('productType.objectSub'),
    icon: 'cube-outline',
    badge: t('productType.newBadge'),
  },
];

/** 01B — TYPE DE PRODUIT : fork Vêtement / Objet (chaque type a ses rendus). */
export default function ProductTypeScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<SubjectType>('vetement');

  const onContinue = () => {
    useRenderDraft.getState().setSubjectType(selected);
    router.push('/import-hub');
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={t('productType.headerTitle')} />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        <Text className="font-heading text-xl text-ink">{t('productType.heading')}</Text>
        <Text className="mt-1.5 font-body text-[12.5px] leading-5 text-gray">
          {t('productType.subtitle')}
        </Text>

        <View className="mt-6 gap-3">
          {OPTIONS.map((opt) => {
            const isSel = selected === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                onPress={() => setSelected(opt.value)}
                className={`flex-row items-center gap-3.5 rounded-2xl border p-4 ${
                  isSel ? 'border-ink bg-white' : 'border-paper3 bg-white'
                }`}
                style={isSel ? { borderWidth: 2 } : undefined}
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-paper2">
                  <Ionicons name={opt.icon} size={24} color={colors.ink} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-heading text-base text-ink">{opt.label}</Text>
                    {opt.badge ? (
                      <View className="rounded-full bg-ink px-2 py-0.5">
                        <Text className="font-heading text-[9px] uppercase tracking-wide text-offwhite">
                          {opt.badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="mt-0.5 font-body text-xs text-gray">{opt.sub}</Text>
                </View>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-full border ${
                    isSel ? 'border-ink bg-ink' : 'border-paper3'
                  }`}
                >
                  {isSel ? <Ionicons name="checkmark" size={14} color={colors.offwhite} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-5 pb-2 pt-2">
        <Button label={t('common.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}
