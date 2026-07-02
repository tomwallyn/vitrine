import { Text, View } from 'react-native';

type BadgeProps = {
  label: string;
  variant?: 'dark' | 'light';
  className?: string;
};

/** Petit badge uppercase (POPULAIRE, EXEMPLE, AVANT/APRÈS…). */
export function Badge({ label, variant = 'dark', className = '' }: BadgeProps) {
  const styles = variant === 'dark' ? 'bg-ink' : 'bg-paper2 border border-paper3';
  const textStyles = variant === 'dark' ? 'text-offwhite' : 'text-gray2';

  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${styles} ${className}`}>
      <Text className={`font-body-bold text-[10px] uppercase tracking-widest ${textStyles}`}>
        {label}
      </Text>
    </View>
  );
}
