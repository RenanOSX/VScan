import { Text, TextInput, TouchableOpacity, View, Alert, Keyboard, TouchableWithoutFeedback } from 'react-native';
import React, { useState } from 'react';
import { styles } from '@/styles/auth.styles';
import * as Linking from 'expo-linking';

export default function Home() {
    const [text, setText] = useState('');

    const isValidGoogleSheetId = (id: string) => {
        const regex = /^[a-zA-Z0-9-_]{44}$/;
        return regex.test(id);
    };

    const handleSearch = () => {
        if (text.trim()) {
            if (isValidGoogleSheetId(text.trim())) {
                const googleSheetsUrl = `https://docs.google.com/spreadsheets/d/${text.trim()}`;
                Linking.openURL(googleSheetsUrl).catch((err) =>
                    console.error("Failed to open URL:", err)
                );
            } else {
                Alert.alert("Invalid ID", "Please enter a valid Google Sheets ID.");
            }
        } else {
            Alert.alert("Empty Field", "Please enter a Google Sheets ID.");
        }
    };

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                <View style={styles.brandSection}>
                    <Text style={styles.appName}>ID Sheets</Text>
                    <View style={{ padding: 10, width: '80%' }}>
                        <TextInput
                            style={{
                                height: 40,
                                padding: 5,
                                borderWidth: 1,
                                borderColor: 'gray',
                                borderRadius: 5,
                                color: 'white',
                            }}
                            placeholder="Enter Google Sheets ID..."
                            placeholderTextColor="gray"
                            onChangeText={(newText) => setText(newText)}
                            value={text}
                        />
                    </View>
                    <View style={{ padding: 10, width: '50%' }}>
                        <TouchableOpacity style={styles.googleButton} onPress={handleSearch}>
                            <Text style={styles.googleButtonText}>Search</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </TouchableWithoutFeedback>
    );
}