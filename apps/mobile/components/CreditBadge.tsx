import { Text, View } from 'react-native';

type CreditBadgeProps = {
  credits?: number;
  className?: string;
};

/** Pastille de solde de crédits (header Accueil, écran 07…). */
export function CreditBadge({ credits = 12, className = '' }: CreditBadgeProps) {
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full border border-paper3 bg-white px-3 py-1.5 ${className}`}
    >
      <View className="h-2 w-2 rounded-full bg-ink" />
      <Text className="font-body-bold text-xs text-ink">{credits} crédits</Text>
    </View>
  );
}
