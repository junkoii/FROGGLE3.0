const fs = require('fs');
const path = require('path');

// Read the metadata file
const metadataPath = path.join(__dirname, 'froggle-metadata.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

console.log("🐸 FROGGLE Token Metadata Upload Guide");
console.log("=====================================");
console.log("");
console.log("📄 Metadata to upload:");
console.log(JSON.stringify(metadata, null, 2));
console.log("");
console.log("🌐 IPFS Upload Options:");
console.log("");
console.log("1️⃣  **Pinata (Recommended - Free)**");
console.log("   • Go to: https://pinata.cloud");
console.log("   • Create free account");
console.log("   • Upload froggle-metadata.json");
console.log("   • Get IPFS hash (starts with 'Qm' or 'bafy')");
console.log("");
console.log("2️⃣  **NFT.Storage (Free)**");
console.log("   • Go to: https://nft.storage");
console.log("   • Create free account");
console.log("   • Upload metadata file");
console.log("   • Get IPFS URL");
console.log("");
console.log("3️⃣  **Web3.Storage (Free)**");
console.log("   • Go to: https://web3.storage");
console.log("   • Upload file and get CID");
console.log("");
console.log("📝 After uploading, you'll get an IPFS URL like:");
console.log("   ipfs://QmYourHashHere");
console.log("   or");
console.log("   https://gateway.pinata.cloud/ipfs/QmYourHashHere");
console.log("");
console.log("🔗 Next Steps:");
console.log("1. Upload the metadata to IPFS");
console.log("2. Get the IPFS URL/hash");
console.log("3. Use Solana CLI or Metaplex to create metadata account:");
console.log("");
console.log("   solana-cli command example:");
console.log("   spl-token create-metadata \\");
console.log("     4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle \\");
console.log("     'FROGGLE' \\");
console.log("     'FROGGLE' \\");
console.log("     'ipfs://YOUR_HASH_HERE'");
console.log("");
console.log("💡 Alternative: Use Metaplex Candy Machine or Sugar CLI");
console.log("");

// Create a simple upload instruction file
const instructions = `
# FROGGLE Token Metadata Upload Instructions

## Step 1: Upload to IPFS
1. Go to https://pinata.cloud and create a free account
2. Click "Upload" → "File"
3. Upload the file: froggle-metadata.json
4. Copy the IPFS hash (CID)

## Step 2: Create Metadata Account
Use one of these methods:

### Method A: Solana CLI (if you have it installed)
\`\`\`bash
spl-token create-metadata \\
  4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle \\
  "FROGGLE" \\
  "FROGGLE" \\
  "ipfs://YOUR_IPFS_HASH_HERE"
\`\`\`

### Method B: Metaplex Sugar CLI
\`\`\`bash
sugar create-metadata \\
  --mint 4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle \\
  --uri "ipfs://YOUR_IPFS_HASH_HERE"
\`\`\`

### Method C: Use a service like:
- Metaplex Studio: https://studio.metaplex.com
- Solana Token Creator: https://solana-token-creator.com
- Strata Protocol: https://app.strataprotocol.com

## Step 3: Verify
After creating metadata, check on:
- Solscan: https://solscan.io/token/4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle
- Solana Explorer: https://explorer.solana.com/address/4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle

The token should now show "FROGGLE" name and logo!
`;

const instructionsPath = path.join(__dirname, 'UPLOAD_INSTRUCTIONS.md');
fs.writeFileSync(instructionsPath, instructions);

console.log("📋 Detailed instructions saved to:", instructionsPath);
console.log("");
console.log("🚀 Ready to make FROGGLE famous! 🐸"); 