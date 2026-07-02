import { Pressable, Text } from 'react-native';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
};

/** Bouton charte VITRINE — primary (encre) / secondary (contour). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  className = '',
}: ButtonProps) {
  const base = 'h-14 items-center justify-center rounded-full px-8';
  const styles =
    variant === 'primary'
      ? 'bg-ink active:opacity-80'
      : 'border border-ink bg-transparent active:bg-paper2';
  const textStyles = variant === 'primary' ? 'text-offwhite' : 'text-ink';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`${base} ${styles} ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <Text className={`font-heading text-base tracking-wide ${textStyles}`}>{label}</Text>
    </Pressable>
  );
}
