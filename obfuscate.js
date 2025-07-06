const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const trackJsPath = path.join(__dirname, 'public', 'track.js');
const obfuscatedTrackJsPath = path.join(__dirname, 'public', 'track.obfuscated.js');

try {
    console.log('Reading file:', trackJsPath);
    const code = fs.readFileSync(trackJsPath, 'utf8');

    console.log('Obfuscating code...');
    const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 1,
        numbersToExpressions: true,
        simplify: true,
        stringArrayShuffle: true,
        splitStrings: true,
        stringArrayThreshold: 1
    });

    const obfuscatedCode = obfuscationResult.getObfuscatedCode();
    console.log('Writing obfuscated file to:', obfuscatedTrackJsPath);
    fs.writeFileSync(obfuscatedTrackJsPath, obfuscatedCode);

    console.log('Obfuscation completed successfully.');

} catch (error) {
    console.error('An error occurred during obfuscation:', error);
    process.exit(1); // Exit with an error code
}
