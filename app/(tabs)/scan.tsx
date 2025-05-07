import { View, Text, StyleSheet, TouchableOpacity, Image, SafeAreaView, Platform, Alert, ActivityIndicator, Share } from 'react-native'
import React, { useState, useEffect } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { AntDesign, Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system'
import { WebView } from 'react-native-webview'
import * as Linking from 'expo-linking'
import { COLORS } from '@/constants/theme'
import { router } from 'expo-router'

// Define proper types for the selected file
type FileInfo = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

// Config for Python backend
const API_CONFIG = {
  baseUrl: Platform.OS === 'web' ? 'http://localhost:5000' : 'http://10.0.2.2:5000', // Use 10.0.2.2 for Android emulator to access localhost
  scanEndpoint: '/scan'
}

export default function Scan() {
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null)
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)

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

  // Call Python script function
  const callPythonScript = async (fileUri: string) => {
    try {
      const formData = new FormData();
      
      // Create file object for multipart/form-data
      const fileNameParts = selectedFile?.name?.split('.') || ['file', 'unknown'];
      const fileType = fileNameParts[fileNameParts.length - 1];
      
      // Better way to create the file object for Flask compatibility
      if (Platform.OS === 'web') {
        // For web, fetch the file first and then append it
        try {
          const response = await fetch(fileUri);
          const blob = await response.blob();
          formData.append('file', blob, selectedFile?.name || 'file.' + fileType);
        } catch (fetchError) {
          console.error('Error fetching file for form data:', fetchError);
          // Fallback to basic approach
          formData.append('file', {
            uri: fileUri,
            name: selectedFile?.name || 'file.' + fileType,
            type: selectedFile?.mimeType || 'application/' + fileType
          } as any);
        }
      } else {
        // Mobile approach
        formData.append('file', {
          uri: fileUri,
          name: selectedFile?.name || 'file.' + fileType,
          type: selectedFile?.mimeType || 'application/' + fileType
        } as any);
      }
      
      console.log(`Sending request to ${API_CONFIG.baseUrl}${API_CONFIG.scanEndpoint}`);
      
      // Make request to Python backend
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.scanEndpoint}`, {
        method: 'POST',
        body: formData,
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
      // Handle platform-specific URI formats
      const fileUri = Platform.OS === 'ios' 
        ? selectedFile.uri.replace('file://', '') 
        : selectedFile.uri
        
      console.log('Scanning file:', fileUri)
      
      // Only verify file existence when not on web platform
      if (Platform.OS !== 'web') {
        const fileInfo = await FileSystem.getInfoAsync(fileUri)
        if (!fileInfo.exists) {
          throw new Error("File does not exist")
        }
      }
      
      // Call Python script with proper routing
      await callPythonScript(selectedFile.uri);
      
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {selectedFile ? (
          <TouchableOpacity onPress={clearSelection} style={styles.headerButton}>
            <AntDesign name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
        
        <Text style={styles.headerTitle}>Document Scanner</Text>
        
        {selectedFile && (
          <TouchableOpacity onPress={scanFile} style={styles.scanButton}>
            <Text style={styles.scanButtonText}>Scan It</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Processing...</Text>
          </View>
        ) : selectedFile ? (
          <View style={styles.previewContainer}>
            {fileType === 'pdf' ? (
              Platform.OS === 'android' ? (
                <WebView
                  source={{ uri: selectedFile.uri }}
                  style={styles.pdfView}
                  originWhitelist={['*']}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  onError={() => Alert.alert('Error', 'Failed to load PDF.')}
                />
              ) : (
                <View style={styles.pdfPlaceholder}>
                  <AntDesign name="pdffile1" size={72} color={COLORS.primary} />
                  <Text style={styles.pdfText}>PDF file selected</Text>
                  <Text style={styles.pdfSubtext}>PDF preview available after scanning</Text>
                </View>
              )
            ) : (
              <Image
                source={{ uri: selectedFile.uri }}
                style={styles.imagePreview}
                resizeMode="contain"
              />
            )}
            <Text style={styles.fileName}>{selectedFile.name}</Text>
          </View>
        ) : (
          <View style={styles.emptyStateContainer}>
            <TouchableOpacity style={styles.selectButton} onPress={selectFile}>
              <Ionicons name="document-text" size={64} color={COLORS.primary} />
              <Text style={styles.selectText}>Select PDF or Image</Text>
            </TouchableOpacity>
            <Text style={styles.instructionText}>
              Select a document to scan it with our AI-powered processing
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  headerButton: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  scanButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  scanButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  selectButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    borderWidth: 2,
    borderColor: COLORS.surface,
    borderStyle: 'dashed',
    borderRadius: 16,
    width: '90%',
    aspectRatio: 1.5,
    backgroundColor: COLORS.surfaceLight,
    marginBottom: 20,
  },
  selectText: {
    marginTop: 15,
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.primary,
  },
  instructionText: {
    textAlign: 'center',
    color: COLORS.grey,
    paddingHorizontal: 20,
    fontSize: 14,
  },
  previewContainer: {
    width: '100%',
    height: '90%',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 10,
  },
  imagePreview: {
    width: '100%',
    height: '90%',
    borderRadius: 8,
  },
  pdfView: {
    flex: 1,
    width: '100%',
    height: '90%',
  },
  fileName: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.primary,
  },
  pdfPlaceholder: {
    flex: 1,
    width: '100%',
    height: '90%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
  },
  pdfText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  pdfSubtext: {
    marginTop: 10,
    fontSize: 14,
    color: COLORS.grey,
  },
  viewPdfButton: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  viewPdfButtonText: {
    color: COLORS.white,
    fontWeight: '600',
  }
})