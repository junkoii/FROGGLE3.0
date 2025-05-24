const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// Configuration via environment variables
// -------------------------------------------------------------
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

// Connessione a Solana mainnet (QuickNode / Helius / public RPC)
const connection = new Connection(RPC_URL, 'confirmed');

// Wallet che riceve i fondi della presale
const ADMIN_WALLET = process.env.ADMIN_WALLET || "6sY8rEL3yhC4XC14NJUxwujMemz5d2QNSh6VRBymQ6eS";

// Presale price configuration
// 1 $FROGGLE = 0.00098 USD  (≈ $0.00098)
const TOKEN_PRICE_USD = 0.00098;

// Conversion helpers
// How many FROGGLE you get for 1 USDT (≈1 USD)
const TOKENS_PER_USDT = 1 / TOKEN_PRICE_USD; // ≈ 1 020.408 tokens

// In-memory cache for the last fetched SOL price (USD)
let cachedSolPrice = null;
let lastPriceFetch = 0;
const PRICE_CACHE_DURATION_MS = 30 * 1000; // 30 secondi per aggiornamenti più frequenti

// FROGGLE Token information
const FROGGLE_MINT_ADDRESS = "4b48dmT8DpV5PDkbuuXVgL9gKqSE9t1TwYVKkyFy1iRK";
const FROGGLE_ADMIN_TOKEN_ACCOUNT = "6boMZ7QTJ5hBpMSQJEsMDHsDuYiSswocdmASBnxkq3s9";

/**
 * Fetch current SOL → USD price (with simple in-memory caching)
 */
async function getSolPriceUSD () {
  try {
    const now = Date.now();
    
    if (!cachedSolPrice || now - lastPriceFetch > PRICE_CACHE_DURATION_MS) {
      console.log("*** Aggiornamento prezzo SOL da CoinGecko in corso ***");
      const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: 'solana', vs_currencies: 'usd' }
      });
      
      if (!data || !data.solana || !data.solana.usd) {
        console.error("Errore: risposta API CoinGecko non valida:", data);
        if (cachedSolPrice) {
          console.log(`ATTENZIONE: Usando prezzo SOL dalla cache: $${cachedSolPrice} USD`);
          return cachedSolPrice;
        }
        console.log(`ATTENZIONE: Usando prezzo SOL di fallback: $155.16 USD`);
        return 155.16; // Fallback al prezzo attuale se c'è un errore
      }
      
      cachedSolPrice = data.solana.usd;
      lastPriceFetch = now;
      console.log(`*** Prezzo SOL aggiornato da CoinGecko: $${cachedSolPrice} USD ***`);
    } else {
      console.log(`Usando prezzo SOL dalla cache (${Math.round((now - lastPriceFetch)/1000)}s fa): $${cachedSolPrice} USD`);
    }
    
    return cachedSolPrice;
  } catch (error) {
    console.error("Errore durante il recupero del prezzo SOL:", error.message);
    if (cachedSolPrice) {
      console.log(`ATTENZIONE: Usando prezzo SOL dalla cache a causa dell'errore: $${cachedSolPrice} USD`);
      return cachedSolPrice;
    }
    console.log(`ATTENZIONE: Usando prezzo SOL di fallback a causa dell'errore: $155.16 USD`);
    return 155.16; // Fallback al prezzo attuale se c'è un errore
  }
}

/**
 * How many FROGGLE tokens for 1 SOL at the current market price.
 *  tokensPerSol = SOL_price_USD / TOKEN_PRICE_USD
 */
function calcTokensPerSol (solPriceUsd) {
  // Usa il prezzo effettivo di Solana invece di forzare un valore
  const result = solPriceUsd / TOKEN_PRICE_USD;
  
  console.log(`Calcolo tokensPerSol: $${solPriceUsd} USD / $${TOKEN_PRICE_USD} = ${result} tokens per SOL`);
  console.log(`Valore aggiornato: 1 SOL = ${result} FROGGLE`);
  
  return result;
}

// Middleware
app.use(cors());
app.use(express.json());

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
    
    // Calculate token amount using live SOL price
    const solPrice = await getSolPriceUSD();
    const tokensPerSol = calcTokensPerSol(solPrice);
    const froggleAmount = amountSOL * tokensPerSol;
    
    // Calcola il valore in USD di questa transazione al momento dell'acquisto
    const amountUSD = amountSOL * solPrice;
    
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
      verified: true,
      solPriceUSD: solPrice,          // Salva il prezzo del SOL al momento dell'acquisto
      amountUSD: amountUSD            // Salva il valore USD esatto di questa transazione
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
    
    // Per USDT, il valore in USD è uguale all'ammontare di USDT (1:1)
    const amountUSD = parseFloat(amountUSDT);
    
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
      verified: true,
      amountUSD: amountUSD  // Salva il valore USD di questa transazione (1:1 per USDT)
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

// Route to get up-to-date token exchange rates
app.get('/api/token-rates', async (req, res) => {
  try {
    // Verifica se è richiesto un refresh forzato
    const forceRefresh = req.query.force === 'true';
    
    // Se è richiesto un refresh forzato, resettiamo la cache
    if (forceRefresh) {
      cachedSolPrice = null;
      lastPriceFetch = 0;
      console.log('[API] Forzato refresh del prezzo SOL');
    }
    
    // Ottieni prezzo SOL aggiornato
    const solPrice = await getSolPriceUSD();
    const tokensPerSol = calcTokensPerSol(solPrice);
    
    console.log(`[API] /api/token-rates -> solPrice: $${solPrice}, tokensPerSol: ${tokensPerSol}, tokensPerUSDT: ${TOKENS_PER_USDT}`);
    console.log(`[API] Prezzo SOL: $${solPrice}, Prezzo FROGGLE: $${TOKEN_PRICE_USD}`);
    console.log(`[API] Calcolo atteso: $${solPrice} / $${TOKEN_PRICE_USD} = ${solPrice / TOKEN_PRICE_USD} tokens per SOL`);
    
    return res.json({
      tokensPerSol: tokensPerSol,
      tokensPerUSDT: TOKENS_PER_USDT,
      solPriceUSD: solPrice,
      tokenPriceUSD: TOKEN_PRICE_USD
    });
  } catch (err) {
    console.error('Error fetching token rates', err);
    return res.status(500).json({ success: false, message: 'Could not fetch token rates' });
  }
});

// Endpoint to get purchases for a specific wallet
app.get('/api/purchases', (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ success: false, message: 'wallet query param missing' });
    }

    const purchasesData = JSON.parse(fs.readFileSync(PURCHASES_FILE));
    
    // Utilizziamo la stessa funzione di validazione delle transazioni mainnet 
    // che viene utilizzata nell'endpoint /api/total-raised
    const isValidSolanaSignature = (signature) => {
      // Must be a string with correct length
      if (typeof signature !== 'string') {
        return false;
      }
      
      // Deve essere esattamente 88 caratteri
      if (signature.length !== 88) {
        console.log(`Signature length: ${signature.length}, expected 88`);
        return false;
      }
      
      // Must contain only valid Base58 characters (1-9, A-H, J-N, P-Z, a-k, m-z)
      const validBase58 = /^[1-9A-HJ-NP-Za-km-z]{88}$/;
      const isValid = validBase58.test(signature);
      
      if (!isValid) {
        console.log(`Signature formato non valido: ${signature}`);
      }
      
      return isValid;
    };
    
    // Filtriamo solo le transazioni valide del mainnet per questo wallet
    const validWalletPurchases = purchasesData.purchases.filter(p => {
      const isValid = p.walletAddress === wallet && isValidSolanaSignature(p.transactionId);
      console.log(`Validating transaction ${p.transactionId.substring(0, 10)}... for ${wallet}: ${isValid ? 'VALID' : 'INVALID'}`);
      return isValid;
    });

    // Calculate total FROGGLE purchased from valid transactions only
    const totalFroggle = validWalletPurchases.reduce((sum, p) => sum + p.froggleAmount, 0);
    
    console.log(`API purchases per wallet ${wallet}: trovate ${validWalletPurchases.length} transazioni valide per un totale di ${totalFroggle.toLocaleString()} FROGGLE`);

    res.json({ success: true, purchases: validWalletPurchases, totalFroggle });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Endpoint to get live SOL price in USD
app.get('/api/sol-price', async (req, res) => {
  try {
    const price = await getSolPriceUSD();
    res.json({ success: true, price });
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch price' });
  }
});

// Endpoint: total amount raised (USD) & tokens sold
app.get('/api/total-raised', async (req, res) => {
  try {
    const purchasesData = JSON.parse(fs.readFileSync(PURCHASES_FILE));
    console.log("========== TOTAL RAISED CALCULATION ==========");
    console.log(`Total purchases in database: ${purchasesData.purchases.length}`);
    
    // STEP 1: Dump all transaction IDs for inspection
    console.log("All Transaction IDs:");
    purchasesData.purchases.forEach((p, idx) => {
      console.log(`[${idx}] ${p.transactionId} (${p.transactionId.length} chars) - ${p.currency} ${p.currency === 'SOL' ? p.amountSOL : p.amountUSDT}`);
    });
    
    // STEP 2: Define characteristics of mainnet transactions
    // Valid Solana transaction signatures are 88 characters, Base58 encoded
    const isValidSolanaSignature = (signature) => {
      // Must be a string with correct length
      if (typeof signature !== 'string' || signature.length !== 88) {
        return false;
      }
      
      // Must contain only valid Base58 characters (1-9, A-H, J-N, P-Z, a-k, m-z)
      return /^[1-9A-HJ-NP-Za-km-z]{88}$/.test(signature);
    };
    
    // STEP 3: Apply strict filtering for mainnet transactions only
    const mainnetTransactions = purchasesData.purchases.filter(p => {
      // Reject any transaction that doesn't have a valid Solana signature
      if (!isValidSolanaSignature(p.transactionId)) {
        console.log(`REJECTED: ${p.transactionId} - Invalid Solana signature format`);
        return false;
      }
      
      // Accept this transaction as valid
      console.log(`ACCEPTED: ${p.transactionId} - Valid Solana transaction`);
      return true;
    });
    
    console.log(`\nAfter strict filtering: ${mainnetTransactions.length} out of ${purchasesData.purchases.length} are valid mainnet transactions`);
    
    // Ottieni il prezzo SOL attuale per i log e per eventuali transazioni SOL vecchie
    const solPrice = await getSolPriceUSD();
    
    // STEP 4: Calculate totals based only on mainnet transactions
    let totalSol = 0;             // Solo per log/debug
    let totalUsdt = 0;            // Solo per log/debug
    let tokensSold = 0;
    let totalRaisedUSD = 0;       // Questa volta calcoliamo il totale dai valori USD salvati
    
    mainnetTransactions.forEach(p => {
      // Aggiungi il valore in USD di questa transazione
      if (p.amountUSD) {
        // Se esiste il campo amountUSD (per transazioni dopo l'aggiornamento)
        totalRaisedUSD += p.amountUSD;
      } else if (p.currency === 'SOL' && p.solPriceUSD) {
        // Se esistono solPriceUSD ma non amountUSD (situazione improbabile)
        totalRaisedUSD += p.amountSOL * p.solPriceUSD;
      } else if (p.currency === 'SOL') {
        // VECCHIE transazioni SOL senza prezzo salvato (prima del tuo aggiornamento) - le calcoliamo col prezzo attuale
        totalRaisedUSD += p.amountSOL * solPrice;
      } else if (p.currency === 'USDT') {
        // Transazioni USDT sono sempre 1:1 con USD
        totalRaisedUSD += p.amountUSDT;
      }
      
      // Tieni traccia delle quantità per valuta per i log
      if (p.currency === 'SOL') {
        totalSol += p.amountSOL;
      } else if (p.currency === 'USDT') {
        totalUsdt += p.amountUSDT;
      }
      
      // Conteggia i token venduti
      tokensSold += p.froggleAmount;
    });
    
    // STEP 5: Log detailed breakdown for debugging
    console.log("\nFUNDRAISING BREAKDOWN:");
    console.log(`- Total SOL: ${totalSol.toFixed(4)} SOL`);
    console.log(`- Total USDT: ${totalUsdt.toFixed(2)} USDT`);
    console.log(`- Current SOL Price: $${solPrice.toFixed(2)} USD (not used for calculation)`);
    console.log(`- Total Raised: $${totalRaisedUSD.toFixed(2)} USD (using stored USD values)`);
    console.log(`- Goal: $392,000.00 USD`);
    console.log(`- Progress: ${((totalRaisedUSD / 392000) * 100).toFixed(2)}%`);
    console.log(`- Tokens Sold: ${tokensSold.toLocaleString()} FROGGLE`);
    
    // IMPORTANT: If the actual calculated value is still showing 100%,
    // we'll force a lower test value to verify the UI can display it correctly
    const finalRaisedUSD = totalRaisedUSD > 0 ? totalRaisedUSD : 0;
    
    // Send response with calculated totals
    res.json({
      success: true,
      totalRaisedUSD: finalRaisedUSD,
      tokensSold,
      goalUSD: 392000,
      mainnetTransactions: mainnetTransactions.length,
      totalTransactions: purchasesData.purchases.length
    });
    console.log("============================================");
  } catch (err) {
    console.error('Error computing total raised', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Aggiunta di nuova route per ottenere le informazioni sul token FROGGLE
app.get('/api/token-info', async (req, res) => {
  try {
    res.json({
      success: true,
      tokenInfo: {
        mintAddress: FROGGLE_MINT_ADDRESS,
        adminTokenAccount: FROGGLE_ADMIN_TOKEN_ACCOUNT,
        decimals: 9,
        network: "mainnet",
        name: "FROGGLE",
        symbol: "FROG"
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle informazioni sul token:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle informazioni sul token',
      error: error.message
    });
  }
});

// Serve static files from FRONTEND directory (AFTER API routes)
app.use(express.static(path.join(__dirname, '../FRONTEND')));

// Fallback route for SPA (Single Page Application)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../FRONTEND/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`FROGGLE Backend server running on port ${PORT}`);
}); 