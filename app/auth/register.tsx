import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { UserPlus, Mail, Lock, User, Store, ShieldCheck, ArrowLeft } from 'lucide-react-native';
import { storeManager } from '../../lib/mockData';
import { UserRole } from '../../types/database';

import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { ActivityIndicator } from 'react-native';

const ROLES: UserRole[] = ['Администратор', 'Кассир', 'Менеджер'];

export default function RegisterScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.noticeCard}>
        <View style={styles.iconCircle}>
          <ShieldCheck size={48} color="#059669" />
        </View>

        <Text style={styles.noticeTitle}>Регистрация через SuperAdmin</Text>
        <Text style={styles.noticeDesc}>
          В целях безопасности регистрация новых сотрудников и кассиров осуществляется исключительно суперадминистратором в панели управления.
        </Text>

        <View style={styles.stepsCard}>
          <Text style={styles.stepItem}>1. Суперадминистратор создаёт аккаунт в панели управления.</Text>
          <Text style={styles.stepItem}>2. Вы получаете Email и пароль для входа.</Text>
          <Text style={styles.stepItem}>3. Введите полученные данные на странице входа.</Text>
        </View>

        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.replace('/auth/login')}
        >
          <ArrowLeft size={18} color="#FFFFFF" />
          <Text style={styles.loginBtnText}>Перейти к странице входа</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noticeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  noticeDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  stepsCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  stepItem: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 16,
  },
  loginBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
