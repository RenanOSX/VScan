import { Text, TouchableOpacity, View, Image } from 'react-native'
import React, { useState } from 'react'
import { styles } from '@/styles/main.styles';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/theme';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

export default function Create() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
    }
  };

  return (
      <View style={styles.container}>

          {/* HEADER */}  

          <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()}>
                  <Ionicons name="close-outline" size={28} color={COLORS.white}/>
              </TouchableOpacity>
              <TouchableOpacity>
                  <Text style={styles.headerTitle}>Scan File</Text>
              </TouchableOpacity>
          </View>

          {/* CONTENT */}
          {!selectedImage ? (
              <View style={styles.contentContainer}>
                  <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                      <Ionicons name="image-outline" size={100} color={COLORS.grey} />
                      <Text style={styles.emptyImageText}>Tap to select an image</Text>
                  </TouchableOpacity>
              </View>
          ) : (
              <View style={styles.imageSection}>
                  <Image
                      source={{ uri: selectedImage }}
                      style={styles.previewImage}
                  />
                  <TouchableOpacity 
                      style={styles.changeImageButton} 
                      onPress={pickImage}
                  >
                      <Ionicons name="image-outline" size={20} color={COLORS.white}/>
                      <Text style={styles.changeImageText}>Change</Text>
                  </TouchableOpacity>
              </View>
          )}
      </View>
  );
}