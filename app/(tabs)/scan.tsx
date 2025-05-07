import { View, Text, TouchableOpacity, Image, SafeAreaView, Platform, Alert, ActivityIndicator, Share } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { AntDesign, Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system'
import { WebView } from 'react-native-webview'
import * as Linking from 'expo-linking'
import { COLORS } from '@/constants/theme'
import { router } from 'expo-router'
import scanStyles from '@/styles/scan.styles'

// Define proper types for the selected file
type FileInfo = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

// Config for Python backend
const API_CONFIG = {
  baseUrl: 'http://192.168.15.84:5000', // Use your PC's IP address
  scanEndpoint: '/scan'
}

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
      const formData = new FormData();
  
      // Pegue extensão e mimeType
      const fileName = selectedFile?.name || 'file';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      let mimeType = selectedFile?.mimeType;
      if (!mimeType) {
        if (ext === 'pdf') mimeType = 'application/pdf';
        else if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
        else mimeType = 'application/octet-stream';
      }
  
      // Sempre envie o arquivo assim:
      formData.append('file', {
        uri: fileUri,
        name: fileName,
        type: mimeType,
      } as any);
  
      console.log(`Sending request to ${API_CONFIG.baseUrl}${API_CONFIG.scanEndpoint}`);
  
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.scanEndpoint}`, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
          // NÃO defina Content-Type!
        },
      });
  
      return response;
    } catch (error: any) {
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string' &&
        error.message.includes('Failed to fetch')
      ) {
        Alert.alert(
          'Server Connection Error',
          'Could not connect to the Python backend server. Please make sure the server is running with:\n\n' +
          'cd c:\\Users\\Windows\\Desktop\\VScan\\ocr\n' +
          'python extrair_nota.py',
          [{ text: 'OK' }]
        );
      } else {
        throw error;
      }
    }
  };

  const scanFile = async () => {
    if (!selectedFile) return
    
    setIsLoading(true)
    try {
      // Sempre use o uri original (com file://)
      const fileUri = selectedFile.uri;
  
      console.log('Scanning file:', fileUri)
  
      // Verifique existência do arquivo (opcional)
      if (Platform.OS !== 'web') {
        const fileInfo = await FileSystem.getInfoAsync(fileUri)
        if (!fileInfo.exists) {
          throw new Error("File does not exist")
        }
      }
  
      // Chame o backend
      await callPythonScript(fileUri);
  
      Alert.alert('Success', 'File processed successfully!')
    } catch (error) {
      console.log('Error scanning file:', error)
      Alert.alert(
        'Processing Failed',
        'Could not process the file. Please try again.',
        [{ text: 'OK' }]
      )
    } finally {
      setIsLoading(false)
    }
  }

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
            <TouchableOpacity onPress={scanFile} style={scanStyles.scanButton}>
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
    </SafeAreaView>
  )
}