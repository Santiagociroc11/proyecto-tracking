#!/usr/bin/env node

import { handleAdSpendSync } from '../api/ad-spend.js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

async function testAdSpendSync() {
  console.log('🚀 Iniciando prueba de sincronización de gastos publicitarios...');
  console.log('⏰', new Date().toISOString());
  console.log('');

  try {
    const result = await handleAdSpendSync();
    const data = await result.json();
    
    console.log('✅ Resultado de la sincronización:');
    console.log('   Status:', result.status);
    console.log('   Data:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('');
      console.log(`📊 Estadísticas:`);
      console.log(`   • Registros procesados: ${data.processed}`);
      console.log(`   • Errores: ${data.errors}`);
      console.log(`   • Fecha: ${data.date}`);
    }
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error);
    console.error(error.stack);
  }
  
  console.log('');
  console.log('🏁 Prueba completada');
}

// Ejecutar la prueba
testAdSpendSync().catch(console.error); 