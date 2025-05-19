import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Alert,
  Keyboard,
  Animated,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  SafeAreaView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet
} from 'react-native'
import * as Linking from 'expo-linking'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { homeStyles } from '@/styles/home.styles'
import { COLORS } from '@/constants/theme'
//import Clipboard from '@react-native-clipboard/clipboard'
import scanStyles from '@/styles/scan.styles'

export default function SettingsScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  /*const copiarEmail = () => {
  try {
    Clipboard.setString('sheet-writer@ninth-sol-457700-t8.iam.gserviceaccount.com');
    Alert.alert('Sucesso', 'Texto copiado com sucesso!');
  } catch (error) {
    console.error('Erro ao copiar para a área de transferência:', error);
    Alert.alert('Erro', 'Falha ao copiar texto.');
  }
};*/

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start()
  }, [fadeAnim])

  const extractSheetUrl = (input: string) => {
    if (/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(input)) {
      return input
    }
    const idMatch = input.match(/([a-zA-Z0-9-_]{44,})/)
    if (idMatch) {
      return `https://docs.google.com/spreadsheets/d/${idMatch[1]}`
    }
    return null
  }

  const handleSearch = () => {
    const url = extractSheetUrl(text.trim())
    if (url) {
      Linking.openURL(url).catch(err =>
        console.error('Failed to open URL:', err)
      )
    } else {
      Alert.alert(
        'Link inválido',
        'Digite o link completo ou o ID do Google Sheets.'
      )
    }
  }

  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start()
  }
  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start()
  }

  return (
    <SafeAreaView style={[homeStyles.container, { justifyContent: 'flex-start' }]}>
      {/* Header com botão voltar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
        <TouchableOpacity onPress={() => router.navigate('/(tabs)/scan')}>
          <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View
            style={[
              homeStyles.container,
              { opacity: fadeAnim, justifyContent: 'flex-start', paddingTop: 0 }
            ]}
          >
            {/* Legenda pré campo de input */}
            <Text style={[homeStyles.subtitle, { textAlign: 'left', marginTop: 0, marginBottom: 20 }]}>
              Cole o link completo ou apenas o ID da sua planilha.
            </Text>

            {/* Campo de input */}
            <View style={homeStyles.inputSection}>
              <TextInput
                style={homeStyles.input}
                placeholder="Insira link ou ID do Google Sheets"
                placeholderTextColor={COLORS.grey}
                onChangeText={setText}
                value={text}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={COLORS.primary}
              />
            </View>

            {/* Botão de abrir planilha */}
            <Animated.View
              style={{
                alignSelf: 'stretch',
                marginTop: 20,
                transform: [{ scale: scaleAnim }],
              }}
            >
              <Pressable
                style={homeStyles.button}
                onPress={handleSearch}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
              >
                <Text style={homeStyles.buttonText}>Abrir Planilha</Text>
              </Pressable>
            </Animated.View>

            {/* Texto de ajuda para o usuário */}
            <Text
            selectable
            style={[
                homeStyles.subtitle,
                { textAlign: 'left', marginTop: 10, marginBottom: 20 },
            ]}
            >
            Para garantir o correto funcionamento da sincronização, é necessário que você permita e dê acesso de editor para a seguinte conta no google sheets:{' '}
            <Text style={{ color: 'lightblue' }}>
                sheet-writer@ninth-sol-457700-t8.iam.gserviceaccount.com
            </Text>
            {' '}AVISO: É necessário para as edições serem feitas no documento.
            </Text>

          </Animated.View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}