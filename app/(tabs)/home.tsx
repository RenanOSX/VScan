import { Text, TextInput, View, Alert, Keyboard, TouchableWithoutFeedback, Image, Animated, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
import React, { useState, useRef, useEffect } from 'react';
import { homeStyles } from '@/styles/home.styles';
import { COLORS } from '@/constants/theme';
import * as Linking from 'expo-linking';

export default function Home() {
    const [text, setText] = useState('');

    // Animation refs
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    // Aceita tanto o link inteiro quanto só o ID
    const extractSheetUrl = (input: string) => {
        // Se for link do Google Sheets, retorna ele mesmo
        if (/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(input)) {
            return input;
        }
        // Se for só o ID, monta a URL
        const idMatch = input.match(/([a-zA-Z0-9-_]{44,})/);
        if (idMatch) {
            return `https://docs.google.com/spreadsheets/d/${idMatch[1]}`;
        }
        return null;
    };

    const handleSearch = () => {
        const url = extractSheetUrl(text.trim());
        if (url) {
            Linking.openURL(url).catch((err) =>
                console.error("Failed to open URL:", err)
            );
        } else {
            Alert.alert("Link inválido", "Digite o link completo ou o ID do Google Sheets.");
        }
    };

    const onPressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.96,
            useNativeDriver: true,
        }).start();
    };

    const onPressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
        }).start();
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <Animated.View style={[homeStyles.container, { opacity: fadeAnim }]}>
                    {/* LOGO */}
                    <View style={homeStyles.logoSection}>
                        <View>
                            <Image
                                source={require('@/assets/images/icon3.gif')}
                                style={homeStyles.logoImage}
                                resizeMode="contain"
                            />
                        </View>
                        <Text style={homeStyles.title}>
                            ID Sheets
                        </Text>
                        <Text style={homeStyles.subtitle}>
                            Acesse rapidamente sua planilha do Google
                        </Text>
                    </View>

                    {/* INPUT */}
                    <View style={homeStyles.inputSection}>
                        <TextInput
                            style={homeStyles.input}
                            placeholder="Cole o link ou ID do Google Sheets aqui"
                            placeholderTextColor={COLORS.grey}
                            onChangeText={setText}
                            value={text}
                            autoCapitalize="none"
                            autoCorrect={false}
                            selectionColor={COLORS.primary}
                        />
                    </View>

                    {/* BOTÃO */}
                    <Animated.View style={{ alignSelf: 'stretch', marginTop: 20, transform: [{ scale: scaleAnim }] }}>
                        <Pressable
                            style={homeStyles.button}
                            onPress={handleSearch}
                            onPressIn={onPressIn}
                            onPressOut={onPressOut}
                        >
                            <Text style={homeStyles.buttonText}>
                                Abrir Planilha
                            </Text>
                        </Pressable>
                    </Animated.View>

                    {/* DICA */}
                    <Text style={homeStyles.tip}>
                        Cole o link completo ou apenas o ID da sua planilha.
                    </Text>
                </Animated.View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}