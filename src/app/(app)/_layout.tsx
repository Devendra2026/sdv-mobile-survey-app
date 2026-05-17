import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function AppLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand.primary,
        tabBarInactiveTintColor: theme.ink.disabled,
        tabBarStyle: {
          backgroundColor: theme.bg.surface,
          borderTopColor: theme.border.subtle,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="surveys"
        options={{
          title: 'Surveys',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="new-survey"
        options={{
          title: 'New',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size + 6} color="#003B8E" />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen name="survey/[id]" options={{ href: null }} />
      <Tabs.Screen name="survey/wizard" options={{ href: null }} />
      <Tabs.Screen name="wizard" options={{ href: null }} />
      <Tabs.Screen name="qc/[id]" options={{ href: null }} />
    </Tabs>
  );
}
