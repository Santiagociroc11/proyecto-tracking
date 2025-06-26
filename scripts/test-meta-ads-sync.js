const { handleMetaAdsSync } = require('../api/meta-ads-sync.ts');

async function testMetaAdsSync() {
  console.log('🚀 Testing Meta Ads sync...');
  
  try {
    const result = await handleMetaAdsSync();
    
    if (result.success) {
      console.log('✅ Meta Ads sync completed successfully!');
      console.log(`📊 Processed: ${result.totalProcessed} records`);
      console.log(`❌ Errors: ${result.totalErrors}`);
      console.log(`⏱️ Duration: ${result.duration}ms`);
    } else {
      console.log('❌ Meta Ads sync failed:');
      console.log(result.message);
    }
  } catch (error) {
    console.error('💥 Error running Meta Ads sync:', error);
  }
}

// Run the test
testMetaAdsSync(); 