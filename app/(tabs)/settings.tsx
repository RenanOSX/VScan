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
import { useRouter, useFocusEffect } from 'expo-router'
import { homeStyles } from '@/styles/home.styles'
import { COLORS } from '@/constants/theme'
import * as FileSystem from 'expo-file-system';

const OPTIONS_PATH = FileSystem.documentDirectory + 'options.json';

export default function SettingsScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [currentSheetUrl, setCurrentSheetUrl] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Carrega o link atual ao entrar na tela
  useFocusEffect(
    React.useCallback(() => {
      const loadSheetUrl = async () => {
        try {
          const path = OPTIONS_PATH;
          const exists = await FileSystem.getInfoAsync(path);
          if (exists.exists) {
            const content = await FileSystem.readAsStringAsync(path);
            const options = JSON.parse(content);
            setCurrentSheetUrl(options.sheetUrl && options.sheetUrl.trim() !== "" ? options.sheetUrl : null);
          } else {
            setCurrentSheetUrl(null);
          }
        } catch {
          setCurrentSheetUrl(null);
        }
      };
      loadSheetUrl();
    }, [])
  );

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

  const saveSheetUrl = async (url: string) => {
    try {
      const data = { sheetUrl: url };
      await FileSystem.writeAsStringAsync(OPTIONS_PATH, JSON.stringify(data, null, 2));
      setCurrentSheetUrl(url); // Atualiza o estado imediatamente
      setText(''); // Limpa o campo de input após conectar
      Alert.alert('Sucesso', 'Link salvo com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar o link:', error);
      Alert.alert('Erro', 'Falha ao salvar o link.');
    }
  };

  const handleSearch = async () => {
    const url = extractSheetUrl(text.trim());
    if (url) {
      await saveSheetUrl(url); // Save to options.json
      Linking.openURL(url).catch(err =>
        console.error('Failed to open URL:', err)
      );
    } else {
      Alert.alert(
        'Link inválido',
        'Digite o link completo ou o ID do Google Sheets.'
      )
    }
  }

  // Função para limpar a planilha conectada
  const clearSheetUrl = async () => {
    if (!currentSheetUrl) {
      Alert.alert('Nenhuma planilha conectada', 'Não existe nenhuma planilha conectada atualmente.');
      return;
    }
    try {
      await FileSystem.writeAsStringAsync(OPTIONS_PATH, JSON.stringify({ sheetUrl: "" }, null, 2));
      setCurrentSheetUrl(null);
      setText('');
      Alert.alert('Planilha desconectada!');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível limpar a planilha.');
    }
  };

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
            {/* Exibe o link atual */}
            {currentSheetUrl && (
              <View
              style={{
                backgroundColor: '#23272f',
                borderRadius: 10,
                padding: 14,
                marginHorizontal: 24,
                marginBottom: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
              >
              <Ionicons name="information-circle-outline" size={22} color={COLORS.primary} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.white, fontWeight: 'bold', marginBottom: 2, fontSize: 15 }}>
                Planilha conectada:
                </Text>
                <TouchableOpacity onPress={() => Linking.openURL(currentSheetUrl)}>
                <Text
                  selectable
                  numberOfLines={2}
                  ellipsizeMode="middle"
                  style={{
                  color: COLORS.primary,
                  fontSize: 14,
                  backgroundColor: '#181c22',
                  borderRadius: 6,
                  padding: 7,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  textDecorationLine: 'underline',
                  }}
                >
                  {currentSheetUrl}
                </Text>
                </TouchableOpacity>
              </View>
              </View>
            )}
            {!currentSheetUrl && (
              <View
              style={{
                backgroundColor: '#23272f',
                borderRadius: 10,
                padding: 14,
                marginHorizontal: 24,
                marginBottom: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
              >
              <Ionicons name="alert-circle-outline" size={22} color={COLORS.grey} style={{ marginRight: 8 }} />
              <Text style={{ color: COLORS.grey, fontSize: 15 }}>
                Nenhuma planilha conectada.
              </Text>
              </View>
            )}

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
                <Text style={homeStyles.buttonText}>Conectar Planilha</Text>
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
            <Text style={{ color: COLORS.primary }}>
                sheet-writer@ninth-sol-457700-t8.iam.gserviceaccount.com
            </Text>
            {"\n"}
            {"\n"}
            AVISO: É necessário para as edições serem feitas no documento.
            </Text>

            {/* Botão para limpar a planilha conectada */}
            <Animated.View
              style={{
                alignSelf: 'stretch',
                marginTop: 8,
                marginBottom: 8,
                alignItems: 'center',
              }}
            >
              <Pressable onPress={clearSheetUrl}>
                <Text style={{ color: COLORS.primary, textDecorationLine: 'underline', fontSize: 15 }}>
                  Limpar planilha conectada
                </Text>
              </Pressable>
            </Animated.View>

          </Animated.View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}