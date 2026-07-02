import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@vitrine/shared';

/** 02 — PHOTOGRAPHIER : placeholder caméra (expo-camera branché en M2). */
export default function CaptureScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-ink">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-gray3/40"
        >
          <Ionicons name="close" size={20} color={colors.offwhite} />
        </Pressable>
        <Text className="font-heading text-sm uppercase tracking-[2px] text-offwhite">
          Photographier
        </Text>
        <View className="w-10" />
      </View>

      {/* Viseur placeholder + guide de cadrage */}
      <View className="flex-1 items-center justify-center px-8">
        {/* TODO(M2): <CameraView /> expo-camera */}
        <View className="aspect-[3/4] w-full items-center justify-center rounded-3xl border-2 border-dashed border-gray2">
          <Text className="text-5xl">👔</Text>
          <Text className="mt-4 px-8 text-center font-body-medium text-sm leading-5 text-gray">
            Posez le vêtement à plat,{'\n'}cintre centré dans le cadre
          </Text>
        </View>
      </View>

      {/* Contrôles bas : flash · déclencheur · switch cam */}
      <View className="flex-row items-center justify-around px-10 pb-8 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Flash"
          className="h-12 w-12 items-center justify-center rounded-full bg-gray3/40"
        >
          <Ionicons name="flash-off" size={20} color={colors.offwhite} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Prendre la photo"
          onPress={() => router.push('/render-config')}
          className="h-20 w-20 items-center justify-center rounded-full border-4 border-offwhite active:opacity-80"
        >
          <View className="h-16 w-16 rounded-full bg-offwhite" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Changer de caméra"
          className="h-12 w-12 items-center justify-center rounded-full bg-gray3/40"
        >
          <Ionicons name="camera-reverse-outline" size={20} color={colors.offwhite} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
