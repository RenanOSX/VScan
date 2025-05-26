import React, { useState } from 'react';
import {Alert, Image, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { COLORS } from '@/constants/theme';
import scanStyles from '@/styles/scan.styles';
import { callBackend, appendData, FileInfo, ScanType } from '../../utils/scanApi';

const SCAN_OPTIONS: { label: string; value: ScanType }[] = [
  { label: 'Google Vision', value: 'google_vision' },
  { label: 'Tesseract', value: 'tesseract' },
];

const OPTIONS_PATH = FileSystem.documentDirectory + 'options.json';

const formatCNPJ = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{2})$/, '$1-$2');

const formatNumber = (v: string) => v.replace(/[^0-9,]/g, '').replace(/(,)(?=.*,)/g, '');

const formatDate = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 8)
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2');

const getSheetUrl = async (): Promise<string | null> => {
  try {
    const content = await FileSystem.readAsStringAsync(OPTIONS_PATH);
    const options = JSON.parse(content);
    if (options.sheetUrl && options.sheetUrl.trim() !== "") {
      return options.sheetUrl;
    }
    return null;
  } catch {
    return null;
  }
};

export default function Scan() {
  const [file, setFile] = useState<FileInfo | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanType, setScanType] = useState(SCAN_OPTIONS[0]);
  const [dropdown, setDropdown] = useState(false);
  const [fields, setFields] = useState<any>({});
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);

  const pickFile = async () => {
    try {
      setLoading(true);
      const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const info: FileInfo = { uri: a.uri, name: a.name || 'file', size: a.size, mimeType: a.mimeType };
      console.log('Arquivo selecionado:', info);
      setFile(info);
      setFileType(info.name.toLowerCase().endsWith('.pdf') || info.mimeType === 'application/pdf' ? 'pdf' : 'image');
    } catch (e) {
      console.error('Erro ao selecionar arquivo:', e);
      Alert.alert('Erro', 'Falha ao selecionar arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const scanFile = async () => {
    if (!file) return;
    setLoading(true);
    try {
      // Check for sheetUrl before scanning
      const sheetUrl = await getSheetUrl();
      if (!sheetUrl) {
        setLoading(false);
        Alert.alert(
          'Google Sheets não configurado',
          'Por favor, adicione um link válido do Google Sheets nas configurações antes de escanear.',
          [
            { text: 'Ir para Configurações', onPress: () => router.push('/settings') },
            { text: 'Cancelar', style: 'cancel' }
          ]
        );
        return;
      }

      if (Platform.OS !== 'web') {
        const info = await FileSystem.getInfoAsync(file.uri);
        if (!info.exists) throw new Error('Arquivo não existe');
      }
      console.log('Enviando para backend...');
      const json = await callBackend(file, scanType.value);
      console.log('Resposta recebida do backend:', json);
      if (!json?.success) throw new Error('Backend retornou falha');
      const data = Array.isArray(json.results) ? json.results[0] : json;
      const f = {
        ...data.fields,
        cnpj: formatCNPJ(String(data.fields?.cnpj ?? '')),
        data_emissao: formatDate(String(data.fields?.data_emissao ?? '')),
        valor_total: formatNumber(String(data.fields?.valor_total ?? '')),
      };
      const its = (data.itens || []).map((it: any) => ({
        descricao: it.descricao ?? '',
        quantidade: formatNumber(String(it.quantidade ?? '')),
        preco_total: formatNumber(String(it.preco_total ?? '')),
      }));
      console.log('Campos extraídos:', f);
      console.log('Itens extraídos:', its);
      setFields(f);
      setItems(its);
      setModal(true);
    } catch (err) {
      console.error('Erro durante processamento do arquivo:', err);
      Alert.alert('Erro', 'Não foi possível processar o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (k: string, v: string) => {
    let formatted = v;
    if (k === 'cnpj') formatted = formatCNPJ(v);
    if (k === 'valor_total') formatted = formatNumber(v);
    if (k === 'data_emissao') formatted = formatDate(v);
    setFields((p: any) => ({ ...p, [k]: formatted }));
  };

  const updateItem = (i: number, k: string, v: string) => {
    const formatted = ['quantidade', 'preco_total'].includes(k) ? formatNumber(v) : v;
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: formatted } : it)));
  };

  return (
    <SafeAreaView style={scanStyles.container}>
      <TouchableOpacity onPress={() => router.push('/settings')} style={scanStyles.settingsButton}>
        <Ionicons name="settings" size={24} color={COLORS.primary} />
      </TouchableOpacity>

      <View style={scanStyles.dropdownContainer}>
        <TouchableOpacity style={scanStyles.dropdownButton} onPress={() => setDropdown(!dropdown)}>
          <Text style={scanStyles.dropdownButtonText}>{scanType.label}</Text>
          <AntDesign name={dropdown ? 'up' : 'down'} size={10} color={COLORS.primary} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
        {dropdown && (
          <View style={scanStyles.dropdownMenu}>
            {SCAN_OPTIONS.map((o) => (
              <TouchableOpacity key={o.value} style={scanStyles.dropdownItem} onPress={() => { setScanType(o); setDropdown(false); }}>
                <Text style={[scanStyles.dropdownItemText, scanType.value === o.value && { color: COLORS.primary }]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={scanStyles.header}>
        {!file ? (
          <View style={scanStyles.headerTitleAloneWrapper}><Text style={scanStyles.headerTitleAlone}>Document Scanner</Text></View>
        ) : (
          <>
            <TouchableOpacity onPress={() => { setFile(null); setFileType(null); }} style={scanStyles.headerButton}>
              <AntDesign name="close" size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={scanStyles.headerTitleSide}>Document Scanner</Text>
            <TouchableOpacity onPress={scanFile} style={scanStyles.scanButton}><Text style={scanStyles.scanButtonText}>Scan It</Text></TouchableOpacity>
          </>
        )}
      </View>

      <View style={scanStyles.content}>
        {loading ? (
          <View style={scanStyles.loadingContainer}>
            <Image source={require('@/assets/images/loading_gura1.gif')} style={{ width: 128, height: 128, marginBottom: 16 }} resizeMode="contain" />
            <Text style={scanStyles.loadingText}>Processando...</Text>
          </View>
        ) : file ? (
          <View style={scanStyles.previewContainer}>
            {fileType === 'pdf' ? (
              Platform.OS === 'android' ? (
                <WebView source={{ uri: file.uri }} style={scanStyles.pdfView} originWhitelist={['*']} />
              ) : (
                <View style={scanStyles.pdfPlaceholder}>
                  <AntDesign name="pdffile1" size={72} color={COLORS.primary} />
                  <Text style={scanStyles.pdfText}>PDF file selected</Text>
                  <Text style={scanStyles.pdfSubtext}>PDF preview available after scanning</Text>
                </View>
              )
            ) : (
              <Image source={{ uri: file.uri }} style={scanStyles.imagePreview} resizeMode="contain" />
            )}
            <Text style={scanStyles.fileName}>{file.name}</Text>
          </View>
        ) : (
          <View style={scanStyles.emptyStateContainer}>
            <TouchableOpacity style={scanStyles.selectButton} onPress={pickFile}>
              <Ionicons name="document-text" size={64} color={COLORS.primary} />
              <Text style={scanStyles.selectText}>Select PDF or Image</Text>
            </TouchableOpacity>
            <Text style={scanStyles.instructionText}>Select a document to scan it with our AI-powered processing</Text>
          </View>
        )}
      </View>

      <Modal visible={modal} animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <SafeAreaView style={{ flex: 1, padding: 20, backgroundColor: '#f9f9f9' }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {Object.entries(fields).map(([k, v]) => {
            // Map field keys to friendly labels
            const fieldLabels: Record<string, string> = {
          cnpj: 'CNPJ',
          data_emissao: 'Data de Emissão',
          valor_total: 'Valor Total',
          // Add more mappings as needed
            };
            // Add emoji based on field key
            let emoji = '';
            if (k.toLowerCase().includes('cnpj')) emoji = '🏢 ';
            else if (k.toLowerCase().includes('data')) emoji = '📅 ';
            else if (k.toLowerCase().includes('valor')) emoji = '💰 ';
            else emoji = '📝 ';
            const label = fieldLabels[k] || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return (
          <View key={k} style={{ marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>{emoji}{label}</Text>
            <TextInput
              value={String(v)}
              onChangeText={(t) => updateField(k, t)}
              style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8, backgroundColor: '#f7f7f7' }}
              placeholder={`Digite o valor de ${label}`}
            />
          </View>
            );
          })}
          {items.map((item, i) => (
            <View key={i} style={{ marginBottom: 24, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
          {(['descricao', 'quantidade', 'preco_total'] as const).map((f) => {
            const itemLabels: Record<string, string> = {
              descricao: 'Descrição',
              quantidade: 'Quantidade',
              preco_total: 'Preço Total',
            };
            let emoji = '';
            if (f === 'descricao') emoji = '📦 ';
            else if (f === 'quantidade') emoji = '🔢 ';
            else if (f === 'preco_total') emoji = '💲 ';
            else emoji = '📝 ';
            const label = itemLabels[f] || f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return (
              <View key={f} style={{ marginBottom: 8 }}>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>{emoji}{label}</Text>
            <TextInput
              value={item[f]}
              onChangeText={(t) => updateItem(i, f, t)}
              style={{ borderWidth: 1, padding: 8, borderRadius: 8, backgroundColor: '#f7f7f7' }}
              placeholder={`Digite o valor de ${label}`}
            />
              </View>
            );
          })}
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
          <TouchableOpacity
            onPress={() => setModal(false)}
            style={{ padding: 14, backgroundColor: '#ff4d4d', borderRadius: 12, flex: 1, marginRight: 12 }}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>❌ Recusar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
          setLoading(true);
          const sheetUrl = await getSheetUrl();
          if (!sheetUrl) {
            setLoading(false);
            Alert.alert(
              'Google Sheets não configurado',
              'Por favor, adicione um link válido do Google Sheets nas configurações antes de enviar.',
              [
                { text: 'Ir para Configurações', onPress: () => router.push('/settings') },
                { text: 'Cancelar', style: 'cancel' }
              ]
            );
            return;
          }
          const ok = await appendData(fields, items, sheetUrl); // sheetUrl is now guaranteed to be a string
          Alert.alert(ok ? 'Sucesso' : 'Erro', ok ? 'Dados enviados!' : 'Falha ao enviar dados.');
          if (ok) {
            setModal(false);
            setFile(null);
            setFileType(null);
          }
          setLoading(false);
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
  );
}
