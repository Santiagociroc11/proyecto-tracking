const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Configuración de ofuscación para máxima seguridad
const obfuscationConfig = {
  // Configuraciones básicas
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.8,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
  
  // Transformaciones de identificadores
  identifierNamesGenerator: 'hexadecimal',
  identifierNamesCache: {},
  identifiersPrefix: '',
  
  // Transformaciones de literales
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.8,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.8,
  
  // Transformaciones de declaraciones
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  
  // Configuraciones de dominio restringido
  domainLock: [],
  domainLockRedirectUrl: 'about:blank',
  
  // Configuraciones de validación
  reservedNames: [],
  reservedStrings: [],
  
  // Configuraciones de rendimiento
  selfDefending: true,
  sourceMap: false,
  sourceMapBaseUrl: '',
  sourceMapFileName: '',
  sourceMapMode: 'separate',
  splitStrings: true,
  splitStringsChunkLength: 5,
  
  // Configuraciones de salida
  target: 'browser',
  
  // Configuraciones de Log
  log: false,
  renameGlobals: false,
  renameProperties: false,
  renamePropertiesMode: 'safe',
  ignoreRequireImports: false,
  ignoreImports: false,
  
  // Configuraciones de exclusión
  exclude: [],
  forceTransformStrings: []
};

async function obfuscateTrackingScript() {
  try {
    console.log('🔒 Iniciando ofuscación del script de tracking...');
    
    // Leer el archivo original
    const originalPath = path.join(__dirname, '../public/track.js');
    const obfuscatedPath = path.join(__dirname, '../public/track.obfuscated.js');
    const backupPath = path.join(__dirname, '../public/track.original.js');
    
    if (!fs.existsSync(originalPath)) {
      throw new Error(`No se encontró el archivo original: ${originalPath}`);
    }
    
    const originalCode = fs.readFileSync(originalPath, 'utf8');
    
    // Crear backup del original
    fs.writeFileSync(backupPath, originalCode);
    console.log('✅ Backup creado en:', backupPath);
    
    // Ofuscar el código
    console.log('🔄 Ofuscando código...');
    const obfuscatedResult = JavaScriptObfuscator.obfuscate(originalCode, obfuscationConfig);
    const obfuscatedCode = obfuscatedResult.getObfuscatedCode();
    
    // Guardar versión ofuscada
    fs.writeFileSync(obfuscatedPath, obfuscatedCode);
    console.log('✅ Código ofuscado guardado en:', obfuscatedPath);
    
    // Estadísticas
    const originalSize = Buffer.byteLength(originalCode, 'utf8');
    const obfuscatedSize = Buffer.byteLength(obfuscatedCode, 'utf8');
    const compressionRatio = ((obfuscatedSize - originalSize) / originalSize * 100).toFixed(2);
    
    console.log('\n📊 Estadísticas de ofuscación:');
    console.log(`   Tamaño original: ${originalSize} bytes`);
    console.log(`   Tamaño ofuscado: ${obfuscatedSize} bytes`);
    console.log(`   Cambio de tamaño: ${compressionRatio}%`);
    
    // Mostrar preview del código ofuscado (primeras 200 caracteres)
    console.log('\n🔍 Preview del código ofuscado:');
    console.log(obfuscatedCode.substring(0, 200) + '...');
    
    console.log('\n✅ Ofuscación completada exitosamente!');
    console.log('ℹ️  El archivo original se mantiene como backup');
    console.log('ℹ️  Para usar la versión ofuscada, actualiza el servidor para servir track.obfuscated.js');
    
  } catch (error) {
    console.error('❌ Error durante la ofuscación:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  obfuscateTrackingScript();
}

module.exports = { obfuscateTrackingScript, obfuscationConfig };