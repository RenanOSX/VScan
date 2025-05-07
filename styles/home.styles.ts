
import { COLORS } from "@/constants/theme";
import { StyleSheet, Dimensions } from "react-native";

export const homeStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    logoSection: {
      alignItems: 'center',
      marginBottom: 32,
    },
    logoContainer: {
      width: 125,
      height: 125,
      borderRadius: 20,
      backgroundColor: COLORS.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    logoImage: {
      width: 120,
      height: 120,
      borderRadius: 12,
    },
    title: {
      color: COLORS.primary,
      fontSize: 32,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    subtitle: {
      color: COLORS.grey,
      fontSize: 15,
      letterSpacing: 0.5,
      marginBottom: 0,
      textAlign: 'center',
    },
    inputSection: {
      width: '100%',
      marginBottom: 20,
    },
    input: {
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 18,
      color: COLORS.white,
      fontSize: 16,
      borderWidth: 1,
      borderColor: COLORS.surfaceLight,
      marginBottom: 6,
    },
    button: {
      backgroundColor: COLORS.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      width: '100%',
      marginBottom: 12,
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 2,
    },
    buttonText: {
      color: COLORS.white,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    tip: {
      color: COLORS.grey,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 260,
    },
  });

  export default homeStyles;
