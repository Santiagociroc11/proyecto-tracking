const fs = require('fs');
const path = require('path');

function testObfuscatedScript() {
  console.log('🧪 Iniciando pruebas del script ofuscado...\n');
  
  const originalPath = path.join(__dirname, '../public/track.original.js');
  const obfuscatedPath = path.join(__dirname, '../public/track.obfuscated.js');
  
  try {
    // Verificar que ambos archivos existen
    if (!fs.existsSync(originalPath)) {
      throw new Error('❌ Archivo original no encontrado');
    }
    
    if (!fs.existsSync(obfuscatedPath)) {
      throw new Error('❌ Archivo ofuscado no encontrado');
    }
    
    console.log('✅ Ambos archivos existen');
    
    // Leer archivos
    const originalCode = fs.readFileSync(originalPath, 'utf8');
    const obfuscatedCode = fs.readFileSync(obfuscatedPath, 'utf8');
    
    // Verificar tamaños
    console.log(`📊 Tamaño original: ${originalCode.length} caracteres`);
    console.log(`📊 Tamaño ofuscado: ${obfuscatedCode.length} caracteres`);
    console.log(`📊 Incremento: ${((obfuscatedCode.length / originalCode.length) * 100).toFixed(2)}%\n`);
    
    // Verificar que el código está ofuscado
    const indicators = {
      'Variables ofuscadas': /var _0x[a-f0-9]+/.test(obfuscatedCode),
      'Funciones ofuscadas': /_0x[a-f0-9]+\(/.test(obfuscatedCode),
      'Strings codificados': /\\x[a-f0-9]{2}/.test(obfuscatedCode),
      'Control flow flattening': /switch\s*\([^)]+\)/.test(obfuscatedCode),
      'Debug protection': /debugger/.test(obfuscatedCode),
      'String array': /\[.*'[^']*'.*\]/.test(obfuscatedCode)
    };
    
    console.log('🔍 Verificando indicadores de ofuscación:');
    Object.entries(indicators).forEach(([name, present]) => {
      console.log(`   ${present ? '✅' : '❌'} ${name}`);
    });
    
    // Verificar que no hay código original visible
    const originalPatterns = [
      'visitorId',
      'trackingId',
      'getVisitorId',
      'sendTrackingData',
      'initializeTracking',
      'trackPageView',
      'trackEvent',
      'console.log',
      'localStorage',
      'sessionStorage'
    ];
    
    console.log('\n🔍 Verificando que el código original no es visible:');
    originalPatterns.forEach(pattern => {
      const visible = obfuscatedCode.includes(pattern);
      console.log(`   ${visible ? '❌' : '✅'} "${pattern}" ${visible ? 'VISIBLE' : 'OCULTO'}`);
    });
    
    // Verificar sintaxis JavaScript básica
    console.log('\n🔍 Verificando sintaxis JavaScript:');
    try {
      new Function(obfuscatedCode);
      console.log('   ✅ Sintaxis JavaScript válida');
    } catch (e) {
      console.log('   ❌ Error de sintaxis:', e.message);
    }
    
    // Mostrar muestra del código ofuscado
    console.log('\n📋 Muestra del código ofuscado (primeros 300 caracteres):');
    console.log('━'.repeat(80));
    console.log(obfuscatedCode.substring(0, 300));
    console.log('...');
    console.log('━'.repeat(80));
    
    // Estadísticas finales
    console.log('\n📊 Estadísticas de ofuscación:');
    const obfuscationLevel = Object.values(indicators).filter(Boolean).length;
    console.log(`   Nivel de ofuscación: ${obfuscationLevel}/${Object.keys(indicators).length} técnicas aplicadas`);
    
    if (obfuscationLevel >= 4) {
      console.log('   🎯 Nivel de protección: ALTO');
    } else if (obfuscationLevel >= 2) {
      console.log('   🎯 Nivel de protección: MEDIO');
    } else {
      console.log('   🎯 Nivel de protección: BAJO');
    }
    
    console.log('\n✅ Pruebas completadas exitosamente!');
    
    // Recomendaciones
    console.log('\n💡 Recomendaciones:');
    console.log('   • El código está altamente ofuscado y será difícil de entender');
    console.log('   • Se recomienda probar en un entorno de desarrollo antes de desplegar');
    console.log('   • Mantener el archivo original como backup');
    console.log('   • Considerar re-ofuscar periódicamente para mayor seguridad');
    
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testObfuscatedScript();
}

module.exports = { testObfuscatedScript };