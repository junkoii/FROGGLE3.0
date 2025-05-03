const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const app = express();
const PORT = process.env.PORT || 3000;

// Connessione a Solana mainnet
const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

// Your Solana wallet address (Replace this with your actual address)
const ADMIN_WALLET = "6sY8rEL3yhC4XC14NJUxwujMemz5d2QNSh6VRBymQ6eS";

// Token prices
const TOKENS_PER_SOL = 102000; // Example rate: 1 SOL = 102,000 FROGGLE tokens
const TOKENS_PER_USDT = 1000;  // Example rate: 1 USDT = 1,000 FROGGLE tokens

let cachedSolPrice = null;
let lastPriceFetch = 0;
const PRICE_CACHE_DURATION_MS = 60 * 1000; // 1 minute

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../FRONTEND')));

// Ensure purchases directory exists
const purchasesDir = path.join(__dirname, 'purchases');
if (!fs.existsSync(purchasesDir)) {
  fs.mkdirSync(purchasesDir, { recursive: true });
}

// Database file to track purchases
const PURCHASES_FILE = path.join(purchasesDir, 'purchases.json');

// Initialize purchases file if it doesn't exist
if (!fs.existsSync(PURCHASES_FILE)) {
  fs.writeFileSync(PURCHASES_FILE, JSON.stringify({ purchases: [] }));
}

// Funzione per verificare transazioni Solana
async function verifyTransaction(transactionId, expectedAmount, expectedSender, expectedReceiver) {
  try {
    // Ottieni i dettagli della transazione
    const transactionDetails = await connection.getTransaction(transactionId, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!transactionDetails) {
      return { valid: false, message: 'Transazione non trovata' };
    }

    // Verifica che la transazione sia confermata
    if (transactionDetails.meta.err) {
      return { valid: false, message: 'Transazione fallita' };
    }

    // Verifica il mittente
    const sender = transactionDetails.transaction.message.accountKeys[0].toString();
    if (sender !== expectedSender) {
      return { valid: false, message: 'Mittente non corrispondente' };
    }

    // Verifica il destinatario (per SOL)
    const receiver = transactionDetails.transaction.message.accountKeys[1].toString();
    if (receiver !== expectedReceiver) {
      return { valid: false, message: 'Destinatario non corrispondente' };
    }

    // Verifica l'importo per le transazioni SOL (in lamports)
    if (transactionDetails.meta && transactionDetails.meta.postBalances && transactionDetails.meta.preBalances) {
      const preBalance = transactionDetails.meta.preBalances[1]; // Balance of receiver before
      const postBalance = transactionDetails.meta.postBalances[1]; // Balance of receiver after
      const receivedAmount = postBalance - preBalance;

      // Tolleranza del 5% per le fee
      const minAcceptableAmount = expectedAmount * 0.95;

      if (receivedAmount < minAcceptableAmount) {
        return { 
          valid: false, 
          message: `Importo non corrispondente. Atteso: ${expectedAmount}, Ricevuto: ${receivedAmount}` 
        };
      }
    }

    return { valid: true, message: 'Transazione verificata con successo' };
  } catch (error) {
    console.error('Errore durante la verifica della transazione:', error);
    return { valid: false, message: `Errore di verifica: ${error.message}` };
  }
}

// Route to record a SOL purchase
app.post('/api/record-purchase', async (req, res) => {
  try {
    const { walletAddress, amountSOL, transactionId } = req.body;
    
    if (!walletAddress || !amountSOL || !transactionId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    // Verifica la transazione
    const lamports = Math.floor(amountSOL * 1000000000); // Converti SOL in lamports
    const verification = await verifyTransaction(
      transactionId,
      lamports,
      walletAddress,
      ADMIN_WALLET
    );
    
    if (!verification.valid) {
      return res.status(400).json({ 
        success: false, 
        message: `Transazione non valida: ${verification.message}` 
      });
    }
    
    // Calculate FROGGLE tokens to be received
    const froggleAmount = amountSOL * TOKENS_PER_SOL;
    
    // Load current purchases
    let purchasesData = JSON.parse(fs.readFileSync(PURCHASES_FILE));
    
    // Add new purchase
    purchasesData.purchases.push({
      walletAddress,
      amountSOL: parseFloat(amountSOL),
      froggleAmount,
      transactionId,
      currency: 'SOL',
      timestamp: new Date().toISOString(),
      verified: true
    });
    
    // Save updated purchases
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify(purchasesData, null, 2));
    
    // Return success with tokens amount
    return res.json({
      success: true,
      message: 'Purchase recorded successfully',
      froggleAmount,
      walletAddress
    });
  } catch (error) {
    console.error('Error recording purchase:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Route to record a USDT purchase
app.post('/api/record-usdt-purchase', async (req, res) => {
  try {
    const { walletAddress, amountUSDT, transactionId } = req.body;
    
    if (!walletAddress || !amountUSDT || !transactionId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    // Verifica che la transazione esista (per USDT non possiamo verificare facilmente l'importo)
    try {
      const transactionDetails = await connection.getTransaction(transactionId, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (!transactionDetails) {
        return res.status(400).json({ 
          success: false, 
          message: 'Transazione USDT non trovata' 
        });
      }
      
      if (transactionDetails.meta.err) {
        return res.status(400).json({ 
          success: false, 
          message: 'Transazione USDT fallita' 
        });
      }
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: `Errore verifica transazione USDT: ${error.message}` 
      });
    }
    
    // Calculate FROGGLE tokens to be received
    const froggleAmount = amountUSDT * TOKENS_PER_USDT;
    
    // Load current purchases
    let purchasesData = JSON.parse(fs.readFileSync(PURCHASES_FILE));
    
    // Add new purchase
    purchasesData.purchases.push({
      walletAddress,
      amountUSDT: parseFloat(amountUSDT),
      froggleAmount,
      transactionId,
      currency: 'USDT',
      timestamp: new Date().toISOString(),
      verified: true
    });
    
    // Save updated purchases
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify(purchasesData, null, 2));
    
    // Return success with tokens amount
    return res.json({
      success: true,
      message: 'USDT purchase recorded successfully',
      froggleAmount,
      walletAddress
    });
  } catch (error) {
    console.error('Error recording USDT purchase:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Route to get admin wallet address
app.get('/api/admin-wallet', (req, res) => {
  res.json({ adminWallet: ADMIN_WALLET });
});

// Route to get token rates
app.get('/api/token-rates', (req, res) => {
  res.json({
    tokensPerSol: TOKENS_PER_SOL,
    tokensPerUSDT: TOKENS_PER_USDT
  });
});

// Endpoint to get purchases for a specific wallet
app.get('/api/purchases', (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ success: false, message: 'wallet query param missing' });
    }

    const purchasesData = JSON.parse(fs.readFileSync(PURCHASES_FILE));
    const walletPurchases = purchasesData.purchases.filter(p => p.walletAddress === wallet);

    // Calculate total FROGGLE purchased
    const totalFroggle = walletPurchases.reduce((sum, p) => sum + p.froggleAmount, 0);

    res.json({ success: true, purchases: walletPurchases, totalFroggle });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Endpoint to get live SOL price in USD
app.get('/api/sol-price', async (req, res) => {
  try {
    const now = Date.now();
    if (!cachedSolPrice || now - lastPriceFetch > PRICE_CACHE_DURATION_MS) {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: 'solana',
          vs_currencies: 'usd'
        }
      });
      cachedSolPrice = data.solana.usd;
      lastPriceFetch = now;
    }
    res.json({ success: true, price: cachedSolPrice });
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch price' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`FROGGLE Backend server running on port ${PORT}`);
}); 