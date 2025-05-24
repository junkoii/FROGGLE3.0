const fs = require('fs');
const path = require('path');

// Token information
const TOKEN_ADDRESS = "4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle";

// Create metadata JSON file
const metadata = {
  "name": "FROGGLE",
  "symbol": "FROGGLE",
  "description": "FROGGLE is a revolutionary meme token on Solana blockchain, bringing fun and community together in the crypto space. Join the FROGGLE community and hop into the future of DeFi!",
  "image": "https://froggle3-0.onrender.com/volofroggle.png",
  "external_url": "https://froggle.io",
  "attributes": [
    {
      "trait_type": "Type",
      "value": "Meme Token"
    },
    {
      "trait_type": "Blockchain",
      "value": "Solana"
    },
    {
      "trait_type": "Total Supply",
      "value": "1,000,000,000"
    },
    {
      "trait_type": "Decimals",
      "value": "6"
    }
  ],
  "properties": {
    "files": [
      {
        "uri": "https://froggle3-0.onrender.com/volofroggle.png",
        "type": "image/png"
      }
    ],
    "category": "image"
  }
};

// Save metadata to file
const metadataPath = path.join(__dirname, 'froggle-metadata.json');
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

console.log("🐸 FROGGLE Token Metadata Created!");
console.log("==================================");
console.log("📄 Metadata file:", metadataPath);
console.log("🏷️  Token Name:", metadata.name);
console.log("🔤 Symbol:", metadata.symbol);
console.log("🖼️  Image URL:", metadata.image);
console.log("");
console.log("📝 Next Steps:");
console.log("1. Upload this metadata to IPFS or a permanent hosting service");
console.log("2. Use the metadata URI to create the token metadata account");
console.log("3. The token will then show 'FROGGLE' name in wallets and explorers");
console.log("");
console.log("💡 Alternative: Use a service like Metaplex to handle this automatically");

// Also create a simple HTML preview
const htmlPreview = `
<!DOCTYPE html>
<html>
<head>
    <title>FROGGLE Token Metadata Preview</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .token-card { border: 2px solid #4CAF50; border-radius: 10px; padding: 20px; text-align: center; }
        .token-image { width: 200px; height: 200px; border-radius: 50%; margin: 20px auto; }
        .attributes { text-align: left; margin-top: 20px; }
        .attribute { background: #f5f5f5; padding: 10px; margin: 5px 0; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="token-card">
        <h1>🐸 ${metadata.name}</h1>
        <h2>Symbol: ${metadata.symbol}</h2>
        <img src="${metadata.image}" alt="FROGGLE Logo" class="token-image" />
        <p><strong>Description:</strong> ${metadata.description}</p>
        
        <div class="attributes">
            <h3>Attributes:</h3>
            ${metadata.attributes.map(attr => 
                `<div class="attribute"><strong>${attr.trait_type}:</strong> ${attr.value}</div>`
            ).join('')}
        </div>
        
        <p><strong>Token Address:</strong> <code>${TOKEN_ADDRESS}</code></p>
        <p><strong>External URL:</strong> <a href="${metadata.external_url}" target="_blank">${metadata.external_url}</a></p>
    </div>
</body>
</html>
`;

const htmlPath = path.join(__dirname, 'froggle-metadata-preview.html');
fs.writeFileSync(htmlPath, htmlPreview);

console.log("🌐 HTML Preview created:", htmlPath);
console.log("📱 Open this file in your browser to see how the metadata will look!"); 