'use strict';

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { api } from '../api/client';
import { saveSession } from '../storage/auth';

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    dob: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (value) => setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleRegister() {
    const { first_name, last_name, email, password, dob } = form;
    if (!first_name.trim() || !last_name.trim()) {
      return Alert.alert('Required', 'Please enter your first and last name.');
    }
    if (!email.trim() || !email.includes('@')) {
      return Alert.alert('Required', 'Please enter a valid email address.');
    }
    if (password.length < 6) {
      return Alert.alert('Required', 'Password must be at least 6 characters.');
    }
    if (!dob.trim()) {
      return Alert.alert('Required', 'Please enter your date of birth (YYYY-MM-DD).');
    }

    setLoading(true);
    try {
      const result = await api.guestRegister({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.trim().toLowerCase(),
        password,
        // rfid_uuid is linked in the next step (LinkWristbandScreen)
      });
      await saveSession(result.token, result.guest);
      // Navigate to wristband linking, passing the guest ID for RFID pairing
      navigation.replace('LinkWristband', { guest: result.guest });
    } catch (err) {
      Alert.alert(
        'Registration Failed',
        err.message || 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Create Guest Profile</Text>
        <Text style={styles.subtitle}>
          Register to receive your trip boarding notifications
        </Text>

        <View style={styles.row}>
          <View style={[styles.inputWrapper, styles.halfInput]}>
            <Text style={styles.label}>First Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Jane"
              value={form.first_name}
              onChangeText={update('first_name')}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
          <View style={[styles.inputWrapper, styles.halfInput]}>
            <Text style={styles.label}>Last Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Smith"
              value={form.last_name}
              onChangeText={update('last_name')}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            placeholder="jane@example.com"
            value={form.email}
            onChangeText={update('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="6+ characters"
            value={form.password}
            onChangeText={update('password')}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Date of Birth * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="1990-05-15"
            value={form.dob}
            onChangeText={update('dob')}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>

        <Text style={styles.sectionHeader}>Emergency Contact</Text>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Contact Name</Text>
          <TextInput
            style={styles.input}
            placeholder="John Smith"
            value={form.emergency_contact_name}
            onChangeText={update('emergency_contact_name')}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Contact Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="+1 555 000 0000"
            value={form.emergency_contact_phone}
            onChangeText={update('emergency_contact_phone')}
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create Profile</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.link}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.linkText}>Already have an account? Log in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0057FF',
    marginBottom: 4,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  halfInput: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#0057FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#0057FF',
    fontSize: 14,
  },
});
