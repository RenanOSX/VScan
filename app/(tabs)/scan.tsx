import { View, Text, TouchableOpacity, Image, SafeAreaView, Platform, Alert, ActivityIndicator, Share, KeyboardAvoidingView } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { AntDesign, Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system'
import { WebView } from 'react-native-webview'
import * as Linking from 'expo-linking'
import { COLORS } from '@/constants/theme'
import { router } from 'expo-router'
import scanStyles from '@/styles/scan.styles'
import { Modal, TextInput, ScrollView } from 'react-native';

// Define proper types for the selected file
type FileInfo = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

const getBaseUrl = () => {
  if (Platform.OS === 'web') {
    return 'http://localhost:5000';
  }
  return 'http://192.168.0.249:5000'; 
};

const API_CONFIG = {
  baseUrl: getBaseUrl(),
  scanEndpoint: '/scan',
  appendEndpoint: '/append'
};

// Dropdown options
const SCAN_TYPES = [
  { label: 'Google Vision', value: 'nota' },
  { label: 'Tesseract', value: 'recibo' },
]

export default function Scan() {
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null)
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [selectedScanType, setSelectedScanType] = useState(SCAN_TYPES[0])
  const [dropdownVisible, setDropdownVisible] = useState(false)
  const [scannedFields, setScannedFields] = useState<any>(null);
  const [scannedItens, setScannedItens] = useState<any[]>([]);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);

  const selectFile = async () => {
    try {
      setIsLoading(true)
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true
      })

      // Check if file was selected (not canceled)
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0]
        
        // Ensure we have all required fields
        if (!asset.uri) {
          throw new Error("File URI is undefined")
        }

        // Create a properly typed file info object
        const fileInfo: FileInfo = {
          uri: asset.uri,
          name: asset.name || 'Unknown file',
          size: asset.size,
          mimeType: asset.mimeType
        }
        
        setSelectedFile(fileInfo)
        
        // Determine if it's a PDF or an image
        if (fileInfo.name.toLowerCase().endsWith('.pdf') || 
            fileInfo.mimeType === 'application/pdf') {
          setFileType('pdf')
        } else {
          setFileType('image')
        }
      }
    } catch (error) {
      console.log('Error picking document:', error)
      Alert.alert(
        'Error',
        'Failed to select file. Please try again.',
        [{ text: 'OK' }]
      )
    } finally {
      setIsLoading(false)
    }
  }

  const clearSelection = () => {
    setSelectedFile(null)
    setFileType(null)
  }

  // Function to handle PDF viewing - improved for iOS
  const handlePdfViewing = async (uri: string) => {
    try {
      // For iOS, we need a different approach since file:// URLs don't work well
      if (Platform.OS === 'ios') {
        // Only check if file exists when not on web platform
        {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (!fileInfo.exists) {
            throw new Error("PDF file does not exist");
          }
        }
        
        // Just return true to display the PDF placeholder
        return true;
      }
      return false; // Return false to use WebView on Android
    } catch (error) {
      console.log('Error handling PDF:', error);
      Alert.alert('PDF Viewer Error', 'Could not open the PDF file. Try selecting a different file.');
      return false;
    }
  };

  const callPythonScript = async (fileUri: string) => {
    try {
      const isWeb = Platform.OS === 'web';
  
      if (isWeb) {
        // 1. Ler como base64 na web
        const base64Data = fileUri.split(',')[1]; // remove o 'data:image/...;base64,'
  
        const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.scanEndpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: base64Data, // campo que o backend entende
          }),
        });
  
        return response;
      } else {
        // MOBILE - usar FormData
        const formData = new FormData();
        const fileName = selectedFile?.name || 'file';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        let mimeType = selectedFile?.mimeType;
        if (!mimeType) {
          if (ext === 'pdf') mimeType = 'application/pdf';
          else if (ext === 'png') mimeType = 'image/png';
          else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
          else mimeType = 'application/octet-stream';
        }
  
        formData.append('file', {
          uri: fileUri,
          name: fileName,
          type: mimeType,
        } as any);
  
        const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.scanEndpoint}`, {
          method: 'POST',
          body: formData,
          headers: {
            Accept: 'application/json',
          },
        });
  
        return response;
      }
    } catch (error: any) {
      console.error('Erro ao enviar para backend:', error);
      return null;
    }
  };
  

  const scanFile = async () => {
    console.log('📸 scanFile chamado');
    if (!selectedFile) {
      console.log('❌ Nenhum arquivo selecionado');
      return;
    }
  
    setIsLoading(true);
  
    try {
      const fileUri = selectedFile.uri;
      console.log('🧾 URI do arquivo:', fileUri);
  
      if (Platform.OS !== 'web') {
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo.exists) throw new Error("File does not exist");
      } else {
        console.log('🌐 Rodando na web, pulando getInfoAsync');
      }
  
      const response = await callPythonScript(fileUri);
      console.log('📨 Resposta bruta recebida:', response);
  
      if (!response) {
        console.log('❌ Resposta é null ou undefined');
        return;
      }
  
      const json = await response.json();
      console.log('✅ JSON recebido:', json);
  
      if (json.success) {
        setScannedFields(json.fields);
        setScannedItens(json.itens);
        console.log('🟢 Abrindo modal...');
        setReviewModalVisible(true);
      } else {
        console.log('⚠️ Erro da API:', json.message);
        Alert.alert("Erro", json.message || "Erro na extração");
      }
    } catch (error) {
      console.error('🔥 Erro durante scanFile:', error);
      Alert.alert("Erro", "Não foi possível processar o arquivo.");
    } finally {
      setIsLoading(false);
    }
  };
  
  

  // Effect to automatically handle PDF viewing when a PDF is selected
  useEffect(() => {
    if (selectedFile && fileType === 'pdf') {
      handlePdfViewing(selectedFile.uri);
    }
  }, [selectedFile, fileType]);

  // Dropdown render
  const renderDropdown = () => (
    dropdownVisible && (
      <View style={scanStyles.dropdownMenu}>
        {SCAN_TYPES.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={scanStyles.dropdownItem}
            onPress={() => {
              setSelectedScanType(option)
              setDropdownVisible(false)
            }}
          >
            <Text style={[
              scanStyles.dropdownItemText,
              selectedScanType.value === option.value && { color: COLORS.primary }
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )
  )

  return (
    <SafeAreaView style={scanStyles.container}>
      {/* Dropdown Selector */}
      <View style={scanStyles.dropdownContainer}>
        <TouchableOpacity
          style={scanStyles.dropdownButton}
          onPress={() => setDropdownVisible(!dropdownVisible)}
          activeOpacity={0.8}
        >
          <Text style={scanStyles.dropdownButtonText}>
            {selectedScanType.label}
          </Text>
          <AntDesign name={dropdownVisible ? 'up' : 'down'} size={18} color={COLORS.primary} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
        {renderDropdown()}
      </View>

      {/* Header */}
      <View style={scanStyles.header}>
        {/* Antes de selecionar arquivo: título centralizado */}
        {!selectedFile && (
          <View style={scanStyles.headerTitleAloneWrapper}>
            <Text style={scanStyles.headerTitleAlone}>Document Scanner</Text>
          </View>
        )}

        {/* Após selecionar arquivo: botão X, título à esquerda e botão Scan It à direita */}
        {selectedFile && (
          <>
            <TouchableOpacity onPress={clearSelection} style={scanStyles.headerButton}>
              <AntDesign name="close" size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={scanStyles.headerTitleSide}>Document Scanner</Text>
            <TouchableOpacity onPress={() => {
              console.log('🟩 Botão "Scan It" foi clicado');
              scanFile();
            }} style={scanStyles.scanButton}>
              <Text style={scanStyles.scanButtonText}>Scan It</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Main Content */}
      <View style={scanStyles.content}>
      {isLoading ? (
      <View style={scanStyles.loadingContainer}>
        {/* Replace ActivityIndicator with your image */}
        <Image
          source={require('@/assets/images/loading_gura1.gif')}
          style={{ width: 128, height: 128, marginBottom: 16 }}
          resizeMode="contain"
        />
        <Text style={scanStyles.loadingText}>Processing...</Text>
      </View>
        ) : selectedFile ? (
          <View style={scanStyles.previewContainer}>
            {fileType === 'pdf' ? (
              Platform.OS === 'android' ? (
                <WebView
                  source={{ uri: selectedFile.uri }}
                  style={scanStyles.pdfView}
                  originWhitelist={['*']}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  onError={() => Alert.alert('Error', 'Failed to load PDF.')}
                />
              ) : (
                <View style={scanStyles.pdfPlaceholder}>
                  <AntDesign name="pdffile1" size={72} color={COLORS.primary} />
                  <Text style={scanStyles.pdfText}>PDF file selected</Text>
                  <Text style={scanStyles.pdfSubtext}>PDF preview available after scanning</Text>
                </View>
              )
            ) : (
              <Image
                source={{ uri: selectedFile.uri }}
                style={scanStyles.imagePreview}
                resizeMode="contain"
              />
            )}
            <Text style={scanStyles.fileName}>{selectedFile.name}</Text>
          </View>
        ) : (
          <View style={scanStyles.emptyStateContainer}>
            <TouchableOpacity style={scanStyles.selectButton} onPress={selectFile}>
              <Ionicons name="document-text" size={64} color={COLORS.primary} />
              <Text style={scanStyles.selectText}>Select PDF or Image</Text>
            </TouchableOpacity>
            <Text style={scanStyles.instructionText}>
              Select a document to scan it with our AI-powered processing
            </Text>
          </View>
        )}
      </View>

      <Modal visible={reviewModalVisible} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, backgroundColor: '#f9f9f9' }}>
            <View style={{ marginBottom: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold' }}>📋 Revisar Dados</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {scannedFields && Object.entries(scannedFields).map(([key, value]) => (
                <View key={key} style={{ marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14, marginBottom: 4 }}>
                    {key === 'cnpj' && '🆔 CNPJ'}
                    {key === 'data_emissao' && '📅 Data de Emissão'}
                    {key === 'nome_loja' && '🏢 Nome da Loja'}
                    {key === 'valor_total' && '💰 Valor Total'}
                  </Text>
                  <TextInput
                    value={typeof value === 'string' ? value : ''}
                    onChangeText={(text) => setScannedFields((prev: any) => ({ ...prev, [key]: text }))}
                    style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8, backgroundColor: '#f7f7f7' }}
                    placeholderTextColor="#aaa"
                  />
                </View>
              ))}
              {scannedItens.map((item, idx) => (
                <View key={idx} style={{ marginBottom: 24, paddingBottom: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2 }}>
                  <Text style={{ fontWeight: '600', marginBottom: 4 }}>✏️ Descrição</Text>
                  <TextInput
                    value={item.descricao}
                    onChangeText={(text) => {
                      const newItens = [...scannedItens];
                      newItens[idx].descricao = text;
                      setScannedItens(newItens);
                    }}
                    style={{ borderWidth: 1, padding: 8, borderRadius: 8, marginBottom: 8, backgroundColor: '#f7f7f7' }}
                    placeholderTextColor="#aaa"
                  />
                  <Text style={{ fontWeight: '600', marginBottom: 4 }}>🔢 Quantidade</Text>
                  <TextInput
                    value={item.quantidade}
                    onChangeText={(text) => {
                      const newItens = [...scannedItens];
                      newItens[idx].quantidade = text;
                      setScannedItens(newItens);
                    }}
                    style={{ borderWidth: 1, padding: 8, borderRadius: 8, marginBottom: 8, backgroundColor: '#f7f7f7' }}
                    placeholderTextColor="#aaa"
                  />
                  <Text style={{ fontWeight: '600', marginBottom: 4 }}>💲 Preço Total</Text>
                  <TextInput
                    value={item.preco_total}
                    onChangeText={(text) => {
                      const newItens = [...scannedItens];
                      newItens[idx].preco_total = text;
                      setScannedItens(newItens);
                    }}
                    style={{ borderWidth: 1, padding: 8, borderRadius: 8, backgroundColor: '#f7f7f7' }}
                    placeholderTextColor="#aaa"
                  />
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setReviewModalVisible(false)}
                style={{ padding: 14, backgroundColor: '#ff4d4d', borderRadius: 12, flex: 1, marginRight: 12 }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>❌ Recusar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  setIsLoading(true);
                  try {
                    const res = await fetch(`${API_CONFIG.baseUrl}/append`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ fields: scannedFields, itens: scannedItens }),
                    });
                    const result = await res.json();
                    if (result.success) {
                      Alert.alert('Sucesso', 'Dados enviados para a planilha!');
                      setReviewModalVisible(false);
                      clearSelection();
                    } else {
                      Alert.alert('Erro', 'Falha ao enviar dados para a planilha.');
                    }
                  } catch (e) {
                    Alert.alert('Erro', 'Erro de conexão com o backend.');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                style={{ padding: 14, backgroundColor: COLORS.primary, borderRadius: 12, flex: 1 }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>✅ Confirmar</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}