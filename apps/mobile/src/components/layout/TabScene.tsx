import { useIsFocused } from 'expo-router';
import type { ComponentType } from 'react';
import { View } from 'react-native';

/**
 * Tab scenes are transparent (the shared map shows through), so a tab that is mounted but not focused
 * must hide itself, or it would draw over the active one. `useIsFocused` is exact; navigator options lag a frame.
 */
export function withTabScene<P extends object>(Screen: ComponentType<P>) {
  function TabScene(props: P) {
    const focused = useIsFocused();
    return (
      <View style={{ flex: 1, opacity: focused ? 1 : 0 }} pointerEvents={focused ? 'box-none' : 'none'}
        importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!focused}>
        <Screen {...props} />
      </View>
    );
  }
  TabScene.displayName = `TabScene(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return TabScene;
}
