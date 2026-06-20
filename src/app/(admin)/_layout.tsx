import { LayoutGuard } from '@/components/layout-guard';
import { TAB_BAR_CONTENT_HEIGHT, tabBarBottomInset } from '@/constants/tabBar';
import { api } from '@/convex/_generated/api';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = tabBarBottomInset(insets);
  const { convexReady } = useClerkConvexAuth();
  const { theme } = useTheme();
  const pending = useQuery(api.admin.listPendingApprovals, convexReady ? {} : 'skip');
  const pendingCount = pending?.length ?? 0;

  return (
    <LayoutGuard mode="admin">
      <Tabs
        initialRouteName="approvals"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.brand.primary,
          tabBarInactiveTintColor: theme.ink.tertiary,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginBottom: Platform.OS === 'ios' ? 0 : 4,
          },
          tabBarStyle: {
            backgroundColor: theme.bg.surface,
            borderTopColor: theme.border.subtle,
            height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
            paddingTop: 6,
            paddingBottom: bottomInset + 4,
          },
        }}
      >
        <Tabs.Screen
          name="approvals"
          options={{
            title: 'Approvals',
            tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="users"
          options={{
            title: 'Users',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tenants"
          options={{
            title: 'Tenants',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'map' : 'map-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="masters"
          options={{
            title: 'Masters',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'library' : 'library-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="approve-detail"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="assign-user"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
      </Tabs>
    </LayoutGuard>
  );
}
