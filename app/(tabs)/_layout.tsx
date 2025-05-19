import { Text, View } from 'react-native'
import React, { Component } from 'react'
import { Tabs } from 'expo-router'
import { COLORS } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function RootLayout() {
    return (
      <Tabs screenOptions={{
        tabBarShowLabel: false,
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.grey,
        tabBarStyle: {
          backgroundColor: "black",
          borderTopWidth: 0,
          position: "absolute",
          elevation: 0,
          height: 40,
          paddingBottom: 0,
        },
      }}>
        <Tabs.Screen
          name="settings"
          options={{
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            tabBarIcon: ({size, color}) => <Ionicons name="add-circle" size={size} color={color} />
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            tabBarButton: () => null,
          }}
        />
    </Tabs>
    )
}