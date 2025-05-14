import { View, Text, Image, TouchableOpacity } from 'react-native'
import { styles } from '@/styles/auth.styles'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '@/constants/theme'
import { useSSO } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'

export default function login() {

    const {startSSOFlow} = useSSO()
    const router = useRouter()
    const handleGoogleSignIn = async () => {
        try {
            const {createdSessionId, setActive} = await startSSOFlow({strategy:"oauth_google"})
            
            if (setActive && createdSessionId) {
                setActive({session: createdSessionId})
                router.replace('/(tabs)/scan')
            }
        } catch (error) {
            console.log("OAuth error: ", error)
        }
    }


  return (
    <View style={styles.container}>
        {/* BRAND SECTION */}
        <View style={styles.brandSection}>
            <View style={styles.logoContainer}>
                <Ionicons name='leaf' size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.appName}>Atomic</Text>
            <Text style={styles.tagline}>Fast. Simple. Atomic.</Text>
        </View>


        {/* ILLUSTRATION SECTION */}
        <View style={styles.illustrationContainer}>
            <Image
                source={require('@/assets/images/loading_gura1.gif')}
                style={styles.illustration}
                resizeMode='contain'
            />
        </View>
        
        {/* LOGIN SECTION */}
        <View style={styles.loginSection}>
            <TouchableOpacity 
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
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