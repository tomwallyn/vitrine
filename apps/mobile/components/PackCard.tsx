import { Pressable, Text, View } from 'react-native';

import { t } from '@/lib/i18n';
import { packDiscountPercent, type CreditPackOffer } from '@vitrine/shared';

type PackCardProps = {
  pack: CreditPackOffer;
  /** Pack sélectionné (le CTA « Acheter … » achète ce pack). */
  selected: boolean;
  onPress: () => void;
  /** Prix localisé du store (RevenueCat priceString) — sinon prix € du pack. */
  priceLabel?: string;
};

/**
 * Carte d'un pack de crédits (écran 07 — RECHARGER) : nombre de crédits + prix,
 * badge flottant « POPULAIRE · −25 % » sur le pack mis en avant, bordure encre
 * quand sélectionné.
 */
export function PackCard({ pack, selected, onPress, priceLabel }: PackCardProps) {
  const discount = packDiscountPercent(pack);
  const price = priceLabel ?? `${pack.priceEur} €`;
  const badge = pack.popular
    ? discount > 0
      ? t('packCard.popularBadgeDiscount', { discount })
      : t('packCard.popularBadge')
    : discount > 0
      ? t('packCard.discountBadge', { discount })
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`relative flex-row items-center justify-between rounded-2xl bg-white px-4 py-4 ${
        selected ? 'border-[1.5px] border-ink' : 'border border-paper3 active:bg-paper2'
      } ${badge ? 'mt-2' : ''}`}
    >
      {badge ? (
        <View className="absolute -top-2.5 left-4 rounded-full bg-ink px-2.5 py-1">
          <Text className="font-heading-bold text-[9px] uppercase tracking-widest text-white">
            {badge}
          </Text>
        </View>
      ) : null}
      <View>
        <Text className="font-heading-bold text-base text-ink">
          {t('common.credits', { count: pack.credits })}
        </Text>
      </View>
      <View className={`rounded-xl px-3.5 py-2 ${selected ? 'bg-ink' : 'bg-paper2'}`}>
        <Text
          className={`font-body-bold text-sm ${selected ? 'text-white' : 'text-ink'}`}
        >
          {price}
        </Text>
      </View>
    </Pressable>
  );
}
