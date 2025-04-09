import { Text, TouchableOpacity, View, Image } from 'react-native'
import React from 'react'
import { styles } from '@/styles/auth.styles'
// import { styles } from '@/styles/main.styles'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '@/constants/theme'
import { router } from 'expo-router'

export default function Login() {
    return (
        <View style={styles.container}>
        {/* BRAND SECTION */}
        <View style={styles.brandSection}>
            <View style={styles.logoContainer}>
                <Ionicons name="document-text" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.appName}>VScan</Text>
            <Text style={styles.tagline}>Fast. Simple. Visual. Scannable</Text>
        </View>


        {/* ILLUSTRATION SECTION */}
        <View style={styles.illustrationContainer}>
            <Image
                source={require('@/assets/images/art-bg-1.png')}
                style={styles.illustration}
                resizeMode='contain'
            />
        </View>
        
        {/* LOGIN SECTION */}
        <View style={styles.loginSection}>
            <TouchableOpacity 
            style={styles.googleButton}
            activeOpacity={0.9}
            >
                <View style={styles.googleIconContainer}>
                    <Ionicons name='logo-google' size={20} color={COLORS.surface} />
                </View>
                <Text style={styles.googleButtonText}>
                    Continue with Google
                </Text>
            </TouchableOpacity>
            
            <Text style={styles.termsText}>
                By continuing, you agree to our Terms of Service and Privacy Policy
            </Text>
        </View>
    </View>
    )
  }