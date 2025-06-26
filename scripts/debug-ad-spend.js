#!/usr/bin/env node

console.log('🔍 DEBUG: Sistema de Sincronización de Gastos Publicitarios\n');

async function checkSystemStatus() {
  try {
    // 1. Verificar endpoint de estado
    console.log('📊 Verificando estado del sistema...');
    const statusResponse = await fetch('http://localhost:3000/debug/ad-spend-status');
    
    if (!statusResponse.ok) {
      console.log(`❌ Error: ${statusResponse.status} - ${statusResponse.statusText}`);
      return;
    }

    const status = await statusResponse.json();
    console.log('✅ Estado obtenido exitosamente\n');

    // 2. Mostrar información del cron
    console.log('⏰ ESTADO DEL CRON:');
    console.log(`   Estado: ${status.cron.status === 'running' ? '🟢 Funcionando' : '🔴 Detenido'}`);
    console.log(`   Horario: ${status.cron.schedule}`);
    console.log(`   Habilitado: ${status.cron.enabled ? '✅ Sí' : '❌ No'}`);
    console.log('');

    // 3. Mostrar información de integraciones
    console.log('🔗 INTEGRACIONES DE META:');
    console.log(`   Total: ${status.integrations.total}`);
    console.log(`   Cuentas publicitarias activas: ${status.integrations.activeAdAccounts}`);
    console.log('');

    // 4. Mostrar información de la base de datos
    console.log('💾 BASE DE DATOS:');
    console.log(`   Registros recientes: ${status.database.latestRecords}`);
    console.log(`   Última sincronización: ${status.database.lastSync || 'Nunca'}`);
    
    if (status.database.recentData.length > 0) {
      console.log('   Datos recientes:');
      status.database.recentData.forEach((record, index) => {
        console.log(`     ${index + 1}. Producto: ${record.product_id}, Fecha: ${record.date}, Gasto: ${record.spend} ${record.currency}`);
      });
    } else {
      console.log('   ⚠️  No hay datos recientes');
    }
    console.log('');

    // 5. Mostrar información del entorno
    console.log('🌍 ENTORNO:');
    console.log(`   NODE_ENV: ${status.environment.NODE_ENV || 'no definido'}`);
    console.log(`   ENABLE_AD_SPEND_CRON: ${status.environment.ENABLE_AD_SPEND_CRON || 'no definido'}`);
    console.log(`   ENCRYPTION_KEY configurado: ${status.environment.ENCRYPTION_KEY_SET ? '✅' : '❌'}`);
    console.log('');

    // 6. Análisis y recomendaciones
    console.log('🔍 ANÁLISIS:');
    
    if (status.cron.status !== 'running') {
      console.log('   ⚠️  El cron NO está funcionando');
      console.log('   💡 Solución: Configurar ENABLE_AD_SPEND_CRON=true o NODE_ENV=production');
    } else {
      console.log('   ✅ El cron está funcionando correctamente');
    }

    if (status.integrations.total === 0) {
      console.log('   ⚠️  No hay integraciones de Meta configuradas');
      console.log('   💡 Solución: Conectar al menos una cuenta de Meta en Settings');
    } else if (status.integrations.activeAdAccounts === 0) {
      console.log('   ⚠️  No hay cuentas publicitarias activas');
      console.log('   💡 Solución: Activar cuentas publicitarias en la configuración de productos');
    }

    if (status.database.latestRecords === 0) {
      console.log('   ⚠️  No hay datos de gastos publicitarios');
      console.log('   💡 Solución: Esperar a la próxima sincronización o ejecutar manualmente');
    }

    if (!status.environment.ENCRYPTION_KEY_SET) {
      console.log('   ❌ ENCRYPTION_KEY no está configurado');
      console.log('   💡 Solución: Configurar la variable de entorno ENCRYPTION_KEY');
    }

  } catch (error) {
    console.log('❌ Error verificando el estado:', error.message);
    console.log('💡 Asegúrate de que el servidor esté funcionando en localhost:3000');
  }
}

async function testManualSync() {
  console.log('\n🚀 PROBANDO SINCRONIZACIÓN MANUAL...\n');
  
  try {
    const response = await fetch('http://localhost:3000/api/ad-spend/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-secret-key' // Cambiar por tu clave real
      },
      body: JSON.stringify({})
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ Sincronización manual exitosa');
      console.log(`   📊 Procesados: ${result.processed}`);
      console.log(`   ❌ Errores: ${result.errors}`);
      console.log(`   📅 Fecha: ${result.date}`);
      console.log(`   💬 Mensaje: ${result.message}`);
    } else {
      console.log('❌ Error en sincronización manual:');
      console.log(`   ${result.error || result.message || 'Error desconocido'}`);
    }
    
  } catch (error) {
    console.log('❌ Error ejecutando sincronización manual:', error.message);
    console.log('💡 Verifica que el servidor esté funcionando y la clave sea correcta');
  }
}

async function main() {
  await checkSystemStatus();
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('¿Quieres probar la sincronización manual? (y/N): ', async (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      await testManualSync();
    }
    
    console.log('\n🎯 PRÓXIMOS PASOS:');
    console.log('   1. Ve a /debug/ad-spend-status en tu navegador para monitoreo en vivo');
    console.log('   2. Verifica los logs del servidor para más detalles');
    console.log('   3. Si hay problemas, revisa las variables de entorno');
    console.log('   4. Conecta una integración de Meta si no tienes ninguna');
    
    readline.close();
  });
}

main().catch(console.error); 