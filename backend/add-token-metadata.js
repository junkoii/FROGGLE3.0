const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Metaplex, keypairIdentity, bundlrStorage } = require('@metaplex-foundation/js');
const fs = require('fs');

// Configuration
const RPC_URL = "https://api.mainnet-beta.solana.com";
const TOKEN_MINT = "4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle"; // Your FROGGLE token address

// Token metadata
const TOKEN_METADATA = {
  name: "FROGGLE",
  symbol: "FROGGLE", 
  description: "FROGGLE is a revolutionary meme token on Solana blockchain, bringing fun and community together in the crypto space.",
  image: "https://your-domain.com/froggle-logo.png", // You'll need to upload this
  external_url: "https://froggle.io",
  attributes: [
    {
      trait_type: "Type",
      value: "Meme Token"
    },
    {
      trait_type: "Blockchain", 
      value: "Solana"
    },
    {
      trait_type: "Total Supply",
      value: "1000000000"
    }
  ]
};

async function addTokenMetadata() {
  try {
    console.log("🐸 Starting FROGGLE token metadata creation...");
    
    // Connect to Solana
    const connection = new Connection(RPC_URL);
    
    // You'll need to provide your wallet keypair that has authority over the token
    // For security, this should be loaded from environment variables or secure file
    console.log("❌ ERROR: You need to provide the token authority keypair!");
    console.log("📝 Instructions:");
    console.log("1. Export your wallet private key from Phantom/Solflare");
    console.log("2. Save it as 'wallet-keypair.json' in this directory");
    console.log("3. Run this script again");
    console.log("");
    console.log("⚠️  SECURITY WARNING: Never share your private key!");
    
    // Uncomment and modify this section when you have the keypair:
    /*
    const keypairData = JSON.parse(fs.readFileSync('./wallet-keypair.json', 'utf8'));
    const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    // Initialize Metaplex
    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(wallet))
      .use(bundlrStorage());
    
    console.log("📤 Uploading metadata to IPFS...");
    
    // Upload metadata to IPFS
    const { uri } = await metaplex.nfts().uploadMetadata(TOKEN_METADATA);
    console.log("✅ Metadata uploaded to:", uri);
    
    console.log("🔗 Creating token metadata on-chain...");
    
    // Create metadata account
    const { nft } = await metaplex.nfts().create({
      uri: uri,
      name: TOKEN_METADATA.name,
      symbol: TOKEN_METADATA.symbol,
      sellerFeeBasisPoints: 0,
      useNewMint: new PublicKey(TOKEN_MINT),
      isMutable: true,
    });
    
    console.log("🎉 SUCCESS! Token metadata created!");
    console.log("📍 Metadata account:", nft.metadataAddress.toString());
    console.log("🔗 Metadata URI:", uri);
    */
    
  } catch (error) {
    console.error("❌ Error creating token metadata:", error);
  }
}

// Alternative: Update existing metadata if it already exists
async function updateTokenMetadata() {
  console.log("🔄 This function would update existing metadata");
  console.log("💡 Use this if metadata account already exists but needs updates");
}

console.log("🐸 FROGGLE Token Metadata Manager");
console.log("==================================");
console.log("Token Address:", TOKEN_MINT);
console.log("Network: Solana Mainnet");
console.log("");

addTokenMetadata(); 