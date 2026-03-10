import { EdgeAddonsAPI } from '@plasmohq/edge-addons-api';

const { EDGE_PRODUCT_ID, EDGE_CLIENT_ID, EDGE_API_KEY } = process.env;
const version = process.argv[2];

if (!EDGE_PRODUCT_ID || !EDGE_CLIENT_ID || !EDGE_API_KEY) {
  console.warn('Edge Add-ons credentials not configured — skipping Edge publishing.');
  console.warn('Set EDGE_PRODUCT_ID, EDGE_CLIENT_ID, and EDGE_API_KEY secrets to enable.');
  process.exit(0);
}

const client = new EdgeAddonsAPI({
  productId: EDGE_PRODUCT_ID,
  clientId: EDGE_CLIENT_ID,
  apiKey: EDGE_API_KEY,
});

try {
  await client.submit({
    filePath: 'synchronize-tab-scrolling-chrome.zip',
    notes: `Release v${version}`,
  });
  console.log(`Edge Add-ons: v${version} submitted successfully.`);
} catch (error) {
  console.error('Edge Add-ons submission failed:', error.message);
  process.exit(1);
}
