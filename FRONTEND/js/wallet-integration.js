// public/js/wallet-integration.js

// Import Solana packages
const {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
  clusterApiUrl,
  sendAndConfirmTransaction
} = solanaWeb3;

// Definizione di variabili globali per SPL-Token
let splToken;

// Variabili globali per la UI
let currentCurrency = 'SOL'; // Default currency

// Verifica il supporto per BigInt
const hasBigIntSupport = typeof BigInt !== 'undefined';

// Se BigInt non è supportato, mostra un avviso
if (!hasBigIntSupport) {
  console.warn("BigInt non supportato in questo browser. Le funzionalità USDT potrebbero non funzionare.");
}

// Network settings
const NETWORK = "mainnet-beta"; // Aggiornato per il deploy in produzione

// Token rates
// Default fallbacks (will be overwritten by /api/token-rates)
let TOKENS_PER_USDT = 1020; // ≈ 1/0.00098
let TOKENS_PER_SOL = 153000; // Will be recalculated from live price

// Blockchain connection - Utilizziamo QuickNode come provider RPC privato
  const connection = new Connection(
  "https://omniscient-red-hill.solana-mainnet.quiknode.pro/63ed5508e4b384d4255c9714deffa475c643dd9a/",
    "confirmed"
  );

// USDT Token Account su Solana (Token USDT su mainnet Solana SPL)
const USDT_TOKEN_ADDRESS = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"; // Indirizzo token USDT SPL su mainnet

// Importazione del Token Program per le transazioni USDT
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  
  let wallet = null;
let adminWallet = null;

// FROGGLE Token
const FROGGLE_MINT_ADDRESS = "4b48dmT8DpV5PDkbuuXVgL9gKqSE9t1TwYVKkyFy1iRK"; // Indirizzo del token su mainnet
let froggleTokenInfo = null;

// Minimum purchase in USD
const MIN_PURCHASE_USD = 39;

// ---------------------------------------------------------------------------
//  On-chain fallback constants
// ---------------------------------------------------------------------------
const FROGGLE_ADMIN_TOKEN_ACCOUNT = ""; // set if you want USDT scan
const ADMIN_WALLET_FALLBACK = "6sY8rEL3yhC4XC14NJUxwujMemz5d2QNSh6VRBymQ6eS"; // used if backend not fetched yet

// Helper to abbreviate address
function shortAddr(addr) {
  return addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : '';
}

// Debug helper function for wallet connection
function debugWalletConnection(step, details = {}) {
  const timestamp = new Date().toISOString().slice(11, 23);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  console.log(`[${timestamp}] Wallet Debug (${step}) - iOS: ${isIOS}, Mobile: ${isMobile}`, details);
  
  // Visual overlay disattivato in produzione
 }

// Initialize connection and fetch admin wallet and rates
async function initConnection() {
  try {
    // Inizializza splToken se disponibile globalmente
    if (window.splToken) {
      splToken = window.splToken;
    } else if (window.solanaToken) {
      // Alternativa se caricato con nome diverso
      splToken = window.solanaToken;
    }
    
    // Fetch admin wallet
    const walletResponse = await fetch('https://froggle3-0.onrender.com/api/admin-wallet');
    const walletData = await walletResponse.json();
    adminWallet = walletData.adminWallet;
    console.log("Admin wallet set:", adminWallet);
    
    // Fetch token rates
    const ratesResponse = await fetch(`https://froggle3-0.onrender.com/api/token-rates?t=${timestamp}&force=true`);
    const ratesData = await ratesResponse.json();
    
    TOKENS_PER_SOL = ratesData.tokensPerSol;
    TOKENS_PER_USDT = ratesData.tokensPerUSDT;
    
    // Log dettagliato per debugging
    console.log("===== TOKEN RATES DETTAGLI =====");
    console.log(`Prezzo SOL: $${ratesData.solPriceUSD}`);
    console.log(`Prezzo FROGGLE: $${ratesData.tokenPriceUSD}`);
    console.log(`TOKENS_PER_SOL: ${ratesData.tokensPerSol}`);
    console.log(`TOKENS_PER_USDT: ${ratesData.tokensPerUSDT}`);
    console.log(`Calcolo teorico: $${ratesData.solPriceUSD} / $${ratesData.tokenPriceUSD} = ${ratesData.solPriceUSD / ratesData.tokenPriceUSD}`);
    console.log("================================");
    
    console.log("Token rates loaded:", ratesData);
    
    // Aggiorna le informazioni sui tassi di cambio nell'interfaccia
    if (typeof updateExchangeRatesInfo === 'function') {
      // Supporta la versione asincrona della funzione
      try {
        updateExchangeRatesInfo().catch(e => console.error("Error updating exchange rates:", e));
      } catch (e) {
        console.error("Error calling updateExchangeRatesInfo:", e);
      }
    }
    
    // Carica le informazioni sul token FROGGLE
    await fetchFroggleTokenInfo();
  } catch (error) {
    console.error("Failed to fetch config:", error);
    // Fallback to defaults
    adminWallet = "6sY8rEL3yhC4XC14NJUxwujMemz5d2QNSh6VRBymQ6eS";
  }
}

// Fetch live SOL price from backend
async function getSolPrice() {
  try {
    // Provo prima a prendere il prezzo da CoinGecko direttamente
    try {
      console.log("Frontend: Tentativo di ottenere il prezzo SOL da CoinGecko...");
      // Usa CORS proxy per evitare problemi di CORS con CoinGecko
      const timestamp = new Date().getTime(); // Previene cache
      const coinGeckoRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
      
      if (!coinGeckoRes.ok) {
        throw new Error(`CoinGecko API response error: ${coinGeckoRes.status}`);
      }
      
      const coinGeckoData = await coinGeckoRes.json();
      
      if (coinGeckoData?.solana?.usd) {
        console.log(`Frontend: Prezzo SOL ottenuto da CoinGecko: $${coinGeckoData.solana.usd} USD ✅`);
        
        // Mostra nell'UI che stiamo usando un prezzo aggiornato 
        const exchangeRatesInfo = document.getElementById('exchangeRatesInfo');
        if (exchangeRatesInfo) {
          // Aggiungiamo una piccola indicazione visiva che il prezzo è aggiornato
          exchangeRatesInfo.classList.add('price-updated');
          setTimeout(() => exchangeRatesInfo.classList.remove('price-updated'), 2000);
        }
        
        return coinGeckoData.solana.usd;
      } else {
        throw new Error('Solana price data not found in CoinGecko response');
      }
    } catch (coinGeckoError) {
      console.warn('Frontend: Errore recupero prezzo da CoinGecko, fallback a API alternativa', coinGeckoError);
      
      // Proviamo un'alternativa: Binance per il prezzo SOL/USDT
      try {
        const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
        const binanceData = await binanceRes.json();
        
        if (binanceData && binanceData.price) {
          const solPrice = parseFloat(binanceData.price);
          console.log(`Frontend: Prezzo SOL ottenuto da Binance: $${solPrice} USD ✅`);
          return solPrice;
        }
      } catch (binanceError) {
        console.warn('Frontend: Anche il fallback a Binance è fallito:', binanceError);
      }
    }
    
    // Aggiorniamo il valore hardcoded al prezzo attuale di mercato
    const currentSolPrice = 170.45; // Prezzo SOL aggiornato al 4 luglio 2024
    console.warn(`Frontend: Fallback al prezzo hardcoded: $${currentSolPrice} USD ⚠️`);
    return currentSolPrice;
  } catch (e) {
    console.error('Frontend: Errore critico nel recupero prezzo SOL:', e);
    const currentSolPrice = 170.45; // Prezzo SOL aggiornato al 4 luglio 2024
    console.warn(`Frontend: Fallback al prezzo hardcoded: $${currentSolPrice} USD ⚠️`);
    return currentSolPrice;
  }
}

// Helper function to detect mobile devices
function isMobile() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Funzione principale per connettere il wallet
async function connectWallet() {
  try {
    console.log("Tentativo di connessione wallet...");
    
    // Verifica disponibilità portafogli
    const isPhantomAvailable = !!getPhantomProvider();
    const isSolflareAvailable = window.solflare;
    const isBackpackAvailable = window.backpack;
    const isBraveAvailable = window.braveSolana;
    
    // Mostra sempre la modale di selezione del wallet, indipendentemente da quali sono disponibili
    // In questo modo anche se non ci sono wallet installati, l'utente può scegliere quale vuole installare
    openWalletModal();
    return; // Terminiamo la funzione, la connessione sarà gestita dal modal
    
    // Il resto della funzione non viene mai raggiunto perché abbiamo terminato prima
    
    // Se arriviamo qui, c'è solo un wallet disponibile, lo usiamo automaticamente
    let selectedWallet;
    
    if (isPhantomAvailable) {
      selectedWallet = getPhantomProvider();
    } else if (isSolflareAvailable) {
      selectedWallet = window.solflare;
    } else if (isBackpackAvailable) {
      selectedWallet = window.backpack;
    } else if (isBraveAvailable) {
      selectedWallet = window.braveSolana;
    }
    
    console.log("Connessione a", selectedWallet ? selectedWallet.isPhantom ? "Phantom" : 
                                  selectedWallet.isSolflare ? "Solflare" : 
                                  selectedWallet.isBackpack ? "Backpack" : "Brave Wallet" : "wallet sconosciuto");
    
    // Tenta la connessione
    const resp = await selectedWallet.connect();
    const publicKey = resp.publicKey;
    
    // Configura il wallet globalmente
    wallet = selectedWallet;
    walletPublicKey = publicKey;
    console.log("Connesso con successo al wallet:", publicKey.toString());
    
    // Aggiorna visivamente gli elementi UI
    document.querySelectorAll('.connect-wallet').forEach(button => {
      button.textContent = shortAddr(publicKey.toString());
      button.classList.add('bg-green-500');
    });
    
    // Aggiorna stato visualizzato 
    const walletAddrElem = document.getElementById("walletAddress");
    if (walletAddrElem) walletAddrElem.textContent = shortAddr(publicKey.toString());
    
    // Aggiorna stato nella sezione claim
    const claimWalletStatus = document.getElementById('claimWalletStatus');
    if (claimWalletStatus) {
      claimWalletStatus.innerHTML = `
        <div class="py-0 px-1 bg-white rounded-lg text-center wallet-connected-compact">
          <p class="text-frogBlack text-xs mb-0">Wallet connected</p>
          <p class="text-xs text-green-600">${shortAddr(publicKey.toString())}</p>
        </div>
      `;
    }
    
    // Ottieni i token posseduti
    await fetchWalletTokens();
    
    // Aggiorna i dati della presale (progress bar, etc)
    if (typeof refreshProgress === 'function') {
      refreshProgress();
    }
    
    return publicKey;
  } catch (error) {
    console.error("Errore durante la connessione al wallet:", error);
    alert("Si è verificato un errore durante la connessione: " + error.message);
    return null;
  }
}

// Funzione specifica per connettere un wallet specifico selezionato dal modal
async function connectSpecificWallet(walletType) {
    console.log(`Connecting to ${walletType} wallet...`);
    debugWalletConnection('connectSpecificWallet', { walletType });
    
    closeWalletModal();
    
    try {
        // Skip the generic window.connectWallet here to avoid reopening the modal
        // and to allow direct connection with the specific provider (e.g. Phantom extension).
        
        // Disabilitato: evitiamo di richiamare la funzione globale che riaprirebbe la modale
        if (false && typeof window.connectWallet === 'function') {
            console.log(`Usando connectWallet per ${walletType}...`);
            await window.connectWallet(walletType);
            return;
        }
        
        // Fallback al vecchio metodo se la nuova funzione non è disponibile
        console.log(`Fallback al metodo tradizionale per ${walletType}...`);
        
        // Detect mobile environment
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isAndroid = /Android/i.test(navigator.userAgent);

        // ----- PHANTOM LOGIC -----
        if (walletType === 'phantom') {
            // 1. Verifica se il provider Phantom è già disponibile (desktop extension o in-app browser)
            const phantomProvider = typeof getPhantomProvider === 'function' ? getPhantomProvider() : (window.phantom?.solana || window.solana);

            if (phantomProvider) {
                console.log('Phantom provider detected, procedo con connect()');
                debugWalletConnection('phantom provider found', { inApp: phantomProvider.isPhantom });

                try {
                    const resp = await phantomProvider.connect();
                    wallet = phantomProvider;
                    const publicKey = resp.publicKey.toString();

                    // Update UI for connected wallet
                    document.querySelectorAll('.connect-wallet').forEach(btn => {
                        btn.textContent = shortAddr(publicKey);
                        btn.classList.add('bg-green-500');
                    });
                    const walletAddrElem = document.getElementById('walletAddress');
                    if (walletAddrElem) walletAddrElem.textContent = shortAddr(publicKey);

                    await fetchWalletTokens();
                    await refreshProgress();
                    return resp;
                } catch (err) {
                    console.error('Phantom connect error:', err);
                    alert('Error connecting Phantom: ' + err.message);
                    return;
                }
            }

            // 2. Nessun provider Phantom disponibile -> mostra disclaimer in ogni ambiente mobile o browser in-app (Solflare, ecc.)
            console.log('No Phantom provider – show mobile/open-in-phantom disclaimer');
            debugWalletConnection('phantom provider missing, showing disclaimer');

            if (typeof showMobileWalletDisclaimer === 'function') {
                showMobileWalletDisclaimer('phantom');
            } else {
                alert('Please open this site from the Phantom app browser to connect your wallet.');
            }
            return;
        }
        
        // Handle other wallets and non-iOS platforms
        let provider;
        switch (walletType) {
            case 'phantom':
                provider = window.phantom?.solana || window.solana;
                break;
            case 'solflare':
                provider = window.solflare;
                break;
            case 'backpack':
                provider = window.backpack;
                break;
            case 'brave':
                provider = window.braveSolana;
                break;
        }
        
        if (provider) {
            try {
                const response = await provider.connect();
                wallet = provider;
                const pkObj = response && response.publicKey ? response.publicKey : provider.publicKey;
                const publicKey = typeof pkObj === 'string' ? pkObj : pkObj?.toString();
                if (!publicKey) throw new Error('Wallet connected but publicKey not available');
                
                // Update UI for connected wallet
                const walletAddrElem = document.getElementById("walletAddress");
                if (walletAddrElem) walletAddrElem.textContent = publicKey;
                
                document.querySelectorAll('.connect-wallet').forEach(btn => {
                    btn.textContent = shortAddr(publicKey);
                    btn.classList.add('bg-green-500');
                });
                
                // Update claim section UI
                await fetchWalletTokens();
                await refreshProgress();
                
                return response || { publicKey: pkObj };
            } catch (err) {
                console.error(`Error connecting to ${walletType}:`, err);
                alert(`Could not connect to ${walletType}: ${err.message}`);
            }
        } else {
            // For mobile devices without wallet extensions, use deep linking
            if (isMobile()) {
                if (typeof showMobileWalletDisclaimer === 'function') {
                    showMobileWalletDisclaimer(walletType);
                } else {
                    alert(`Please open this site from the ${walletType} app browser to connect your wallet.`);
                }
            } else {
                // For desktop without extensions
                alert(`${walletType.charAt(0).toUpperCase() + walletType.slice(1)} wallet not detected. Please install the browser extension.`);
            }
        }
    } catch (error) {
        console.error(`Error connecting to ${walletType}:`, error);
        // Mostra errore all'utente
        alert(`Error connecting wallet: ${error.message || 'Unknown error'}`);
    }
}

// Make connectSpecificWallet available globally
window.connectSpecificWallet = connectSpecificWallet;

// Function to buy FROGGLE tokens with SOL
async function buyTokens(lamports) {
  try {
    if (!wallet?.publicKey) {
      alert("Devi prima connettere il wallet!");
      return null;
    }
    
    if (!adminWallet) {
      alert("Errore: Indirizzo di destinazione non configurato.");
      return null;
    }
    
    // Create a Solana transaction to send SOL to admin wallet
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(adminWallet),
        lamports
      })
    );
  
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
  
    // Request wallet signature
    const signed = await wallet.signTransaction(tx);
    
    // Send the transaction to the blockchain
    const signature = await connection.sendRawTransaction(
      signed.serialize()
    );
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed");
    
    // Record the purchase in our backend
    const solAmount = lamports / LAMPORTS_PER_SOL;
    await recordPurchase(wallet.publicKey.toString(), solAmount, signature);
    if (typeof refreshProgress === 'function') refreshProgress();
    
    // Return the transaction signature
    return signature;
  } catch (error) {
    console.error("Transaction error:", error);
    alert("Errore durante la transazione: " + error.message);
    return null;
  }
}

// Funzione migliorata per acquistare FROGGLE tokens con USDT
async function buyWithUSDT(usdtAmount) {
  try {
    if (!wallet?.publicKey) {
      alert("Devi prima connettere il wallet!");
      return null;
    }
    
    if (!adminWallet) {
      alert("Errore: Indirizzo di destinazione non configurato.");
      return null;
    }
    
    // Verifica il supporto di BigInt per le transazioni USDT
    if (!hasBigIntSupport) {
      alert("Questo browser non supporta BigInt, necessario per le transazioni USDT. Usa SOL invece o prova con un browser più recente.");
      return null;
    }
    
    // Arrotonda l'importo a 6 decimali (standard USDT)
    const amount = Math.floor(usdtAmount * 1000000);
    
    // 1. Trova l'account token USDT dell'utente
    const userTokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet.publicKey,
      { mint: new PublicKey(USDT_TOKEN_ADDRESS) }
    );
    
    if (userTokenAccounts.value.length === 0) {
      alert("Non hai un account token USDT. Crea un account token USDT prima di procedere.\nPer crearlo, ricevi una piccola quantità di USDT sul tuo wallet Solana.");
      return null;
    }
    
    const userTokenAccount = userTokenAccounts.value[0].pubkey;
    
    // 2. Trova l'account token dell'admin
    const adminPublicKey = new PublicKey(adminWallet);
    let adminTokenAccount;
    
    const adminTokenAccounts = await connection.getParsedTokenAccountsByOwner(
      adminPublicKey,
      { mint: new PublicKey(USDT_TOKEN_ADDRESS) }
    );
    
    if (adminTokenAccounts.value.length > 0) {
      adminTokenAccount = adminTokenAccounts.value[0].pubkey;
      console.log("Account USDT admin trovato:", adminTokenAccount.toString());
    } else {
      alert("L'amministratore non ha un account token USDT configurato.\nPer ora, usa SOL per l'acquisto.");
      return null;
    }
    
    // 3. Crea l'istruzione di trasferimento SPL Token
    let transferInstruction;
    
    // Verifica se splToken è disponibile
    if (window.splToken && typeof window.splToken.createTransferInstruction === 'function') {
      // Usa il nostro helper
      transferInstruction = window.splToken.createTransferInstruction(
        userTokenAccount,
        adminTokenAccount,
        wallet.publicKey,
        amount,
        [],
        TOKEN_PROGRAM_ID
      );
      console.log("Istruzione di trasferimento creata con successo");
    } else {
      console.error("splToken non disponibile o non correttamente inizializzato");
      alert("Funzionalità USDT non disponibile. Per favore usa SOL per l'acquisto.");
      return null;
    }
    
    // 4. Crea e firma la transazione
    const transaction = new Transaction().add(transferInstruction);
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    
    // 5. Firma e invia la transazione
    const signedTransaction = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    
    // 6. Attendi la conferma
    await connection.confirmTransaction(signature, "confirmed");
    
    // 7. Registra l'acquisto nel backend
    const result = await recordUSDTPurchase(
      wallet.publicKey.toString(), 
      usdtAmount, 
      signature
    );
    
    if (result.success) {
      console.log(`USDT purchase recorded: ${result.froggleAmount} FROGGLE tokens for ${wallet.publicKey.toString()}`);
    }
    
    if (typeof refreshProgress === 'function') refreshProgress();
    
    return signature;
  } catch (error) {
    console.error("USDT Transaction error:", error);
    alert("Errore durante la transazione USDT: " + error.message);
    return null;
  }
}

// Record SOL purchase in backend
async function recordPurchase(walletAddress, amountSOL, transactionId) {
  try {
    const response = await fetch('https://froggle3-0.onrender.com/api/record-purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress,
        amountSOL,
        transactionId
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`Purchase recorded: ${data.froggleAmount} FROGGLE tokens for ${walletAddress}`);
    } else {
      console.error("Failed to record purchase:", data.message);
    }
    
    return data;
  } catch (error) {
    console.error("API error:", error);
    return { success: false, message: "Failed to record purchase" };
  }
}

// Record USDT purchase in backend
async function recordUSDTPurchase(walletAddress, amountUSDT, transactionId) {
  try {
    const response = await fetch('https://froggle3-0.onrender.com/api/record-usdt-purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress,
        amountUSDT,
        transactionId
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`USDT Purchase recorded: ${data.froggleAmount} FROGGLE tokens for ${walletAddress}`);
    } else {
      console.error("Failed to record USDT purchase:", data.message);
    }
    
    return data;
  } catch (error) {
    console.error("API error:", error);
    return { success: false, message: "Failed to record USDT purchase" };
  }
}

// Calculate token amount based on SOL input
async function updatePresaleInfo() {
  try {
    // Ottieni il prezzo SOL aggiornato in tempo reale
    const solPrice = await getSolPrice();
    console.log(`Prezzo SOL attuale (per calcolo token): $${solPrice} USD`);
    
    // Aggiungo timestamp e force per forzare il refresh del prezzo
    const timestamp = new Date().getTime();
    const ratesResponse = await fetch(`https://froggle3-0.onrender.com/api/token-rates?t=${timestamp}&force=true`);
    const ratesData = await ratesResponse.json();
    
    // Prezzo FROGGLE fisso
    const frogglePrice = 0.00098; // $0.00098 per FROGGLE
    
    // Calcola TOKENS_PER_SOL basato sul prezzo attuale di SOL
    const calculatedTokensPerSol = solPrice / frogglePrice;
    console.log(`Calcolo TOKENS_PER_SOL: $${solPrice} / $${frogglePrice} = ${calculatedTokensPerSol.toFixed(2)}`);
    
    // Aggiorna il valore in ratesData
    ratesData.tokensPerSol = calculatedTokensPerSol;
    ratesData.solPriceUSD = solPrice;
    
    // Mostra i dati anche nella console del browser
    console.log("===== AGGIORNAMENTO TOKEN RATES =====");
    console.log(`Prezzo SOL: $${solPrice}`);
    console.log(`Prezzo FROGGLE: $${frogglePrice}`);
    console.log(`TOKENS_PER_SOL: ${calculatedTokensPerSol.toFixed(2)}`);
    console.log(`TOKENS_PER_USDT: ${ratesData.tokensPerUSDT}`);
    console.log(`Calcolo teorico: $${solPrice} / $${frogglePrice} = ${calculatedTokensPerSol.toFixed(2)}`);
    console.log("================================");
    
    // Aggiorna le variabili globali
    TOKENS_PER_SOL = calculatedTokensPerSol;
    TOKENS_PER_USDT = ratesData.tokensPerUSDT;
    
    // Update UI
    await updateInputValues();
    updateExchangeRatesInfo(currentCurrency);
    
    return {
      tokensPerSol: calculatedTokensPerSol,
      tokensPerUSDT: ratesData.tokensPerUSDT,
      earlyBirdBonus: 0.15, // 15% bonus
      earlyBirdThreshold: 50000000, // First 50M tokens get bonus
      totalSold: 0
    };
  } catch (error) {
    console.error("Failed to fetch presale info:", error);
    // Fallback al valore corretto basato sul prezzo SOL attuale
    const solPrice = 155.16; // Prezzo SOL attuale in USD
    const frogglePrice = 0.00098; // Prezzo FROGGLE in USD
    const correctTokensPerSol = solPrice / frogglePrice; // circa 158,326
    console.log(`Fallback a tokensPerSol = ${correctTokensPerSol.toFixed(2)}`);
    
    // Aggiorna le variabili globali con i valori corretti
    TOKENS_PER_SOL = correctTokensPerSol;
    
    return {
      tokensPerSol: correctTokensPerSol,
      tokensPerUSDT: TOKENS_PER_USDT,
      earlyBirdBonus: 0.15,
      earlyBirdThreshold: 50000000,
      totalSold: 0
    };
  }
}

// Aggiungi una funzione per visualizzare il messaggio di errore sull'importo minimo
function showMinimumAmountError(currency, minAmount) {
  const calculationDetails = document.getElementById('calculationDetails');
  if (calculationDetails) {
    calculationDetails.innerHTML = `
      <span class="text-red-500 font-semibold">Minimo acquistabile: ${minAmount} ${currency} ($${MIN_PURCHASE_USD})</span>
    `;
    calculationDetails.classList.remove('hidden');
  }
}

// Aggiungi una funzione per rimuovere il messaggio di errore
function clearMinimumAmountError() {
  const calculationDetails = document.getElementById('calculationDetails');
  if (calculationDetails) {
    calculationDetails.classList.add('hidden');
  }
}

// Modify buyTokens validation
async function buyTokensWithValidation(solAmount) {
  const solPrice = await getSolPrice();
  const usdValue = solAmount * solPrice;
  
  if (usdValue < MIN_PURCHASE_USD) {
    const minSolAmount = (MIN_PURCHASE_USD / solPrice).toFixed(3);
    showMinimumAmountError('SOL', minSolAmount);
    return null;
  }
  
  clearMinimumAmountError();
  const lamports = solAmount * LAMPORTS_PER_SOL;
  return buyTokens(lamports);
}

// Validate USDT amount against minimum purchase
async function buyWithUSDTValidation(usdtAmount) {
  if (usdtAmount < MIN_PURCHASE_USD) {
    showMinimumAmountError('USDT', MIN_PURCHASE_USD);
    return null;
  }
  
  clearMinimumAmountError();
  return buyWithUSDT(usdtAmount);
}

// Fetch activity for wallet
async function fetchActivity() {
  if (!wallet?.publicKey) {
    const container = document.getElementById('walletTransactions');
    if (container) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-4">
          <svg class="w-12 h-12 text-gray-300 mb-2" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 7h-1V6c0-1.1-.9-2-2-2H8C6.9 4 6 4.9 6 6v1H5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-7 10H5V9h7v8zm8 0h-6v-8h6v8zm-9-10V6h4v1h-4z"></path>
          </svg>
          <p class="text-gray-400 text-center">No wallet connected</p>
          <p class="text-gray-400 text-center text-xs mt-1">Please connect a wallet to view your transactions</p>
        </div>`;
    }
    return;
  }
  
  try {
    const container = document.getElementById('walletTransactions');
    if (container) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-4">
          <svg class="animate-spin h-8 w-8 text-frogLight mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-gray-500 text-sm">Loading transactions...</p>
        </div>`;
    }
    
    const res = await fetch(`https://froggle3-0.onrender.com/api/purchases?wallet=${wallet.publicKey.toString()}`);
    const data = await res.json();
    
    if (!data.success || data.purchases.length === 0) {
      // fallback to on-chain scan
      const onchain = await getWalletPurchasesOnchain();
      if (onchain.length > 0) {
        renderActivity(onchain);
        return;
      }
      if (container) {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center py-4">
            <svg class="w-12 h-12 text-gray-300 mb-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 7h-1V6c0-1.1-.9-2-2-2H8C6.9 4 6 4.9 6 6v1H5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-7 10H5V9h7v8zm8 0h-6v-8h6v8zm-9-10V6h4v1h-4z"></path>
            </svg>
            <p class="text-base font-semibold text-center mb-1">No transactions found</p>
            <p class="text-gray-500 text-center text-xs">Looks like this wallet hasn't purchased yet</p>
          </div>`;
        return;
      }
    }
    
    // Filtra le transazioni simulate o di test
    const realPurchases = data.purchases.filter(p => {
      // Escludi transazioni che iniziano con SIMULATED
      if (p.transactionId.startsWith('SIMULATED')) return false;
      
      // Escludi anche transazioni che contengono parole chiave di test
      if (p.transactionId.includes('test') || 
          p.transactionId.includes('devnet') || 
          p.transactionId.includes('testnet') ||
          p.transactionId.length < 20) return false;
          
      return true;
    });

    // Calcola totale basato solo su transazioni reali
    const realTotal = realPurchases.reduce((sum, p) => sum + p.froggleAmount, 0);

    if (realPurchases.length === 0) {
      // Mostra messaggio se non ci sono transazioni reali
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-4">
          <svg class="w-12 h-12 text-gray-300 mb-2" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 7h-1V6c0-1.1-.9-2-2-2H8C6.9 4 6 4.9 6 6v1H5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-7 10H5V9h7v8zm8 0h-6v-8h6v8zm-9-10V6h4v1h-4z"></path>
          </svg>
          <p class="text-base font-semibold text-center mb-1">No transactions found</p>
          <p class="text-gray-500 text-center text-xs">Looks like this wallet hasn't purchased yet</p>
        </div>`;
      return;
    }

    // Formatta le transazioni reali con i nuovi stili CSS
    let html = '<div class="space-y-2">';
    realPurchases.forEach(p => {
      const date = new Date(p.timestamp);
      const formattedDate = `${date.toLocaleDateString()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

      html += `
        <div class="transaction-item bg-white">
          <div class="transaction-date">
            ${formattedDate}
          </div>
          <div class="transaction-amount">
            <span class="text-gray-800 font-medium">
              ${p.currency} ${p.currency === 'SOL' ? p.amountSOL.toFixed(3) : p.amountUSDT}
            </span>
            <span class="text-green-600 font-semibold">+${p.froggleAmount.toLocaleString()} $FROGGLE</span>
          </div>
          <div class="px-2 pb-2 text-xs font-bold text-black">
            TX: <span class="text-black">${p.transactionId}</span>
          </div>
        </div>`;
    });
    
    html += `<div class="total-row text-black font-bold mt-4 px-2 py-2 bg-gray-200 rounded-lg">Total: ${Number(realTotal).toLocaleString()} $FROGGLE</div>`;
    html += '</div>';
    
    container.innerHTML = html;
    
    // Aggiorna anche i token nella sezione claim
    if (typeof fetchWalletTokens === 'function') {
      fetchWalletTokens();
    }
  } catch (error) {
    console.error('Error fetching activity:', error);
    const container = document.getElementById('walletTransactions');
    if (container) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-4">
          <svg class="w-12 h-12 text-gray-300 mb-2" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 7h-1V6c0-1.1-.9-2-2-2H8C6.9 4 6 4.9 6 6v1H5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-7 10H5V9h7v8zm8 0h-6v-8h6v8zm-9-10V6h4v1h-4z"></path>
          </svg>
          <p class="text-base font-semibold text-center mb-1">No transactions found</p>
          <p class="text-gray-500 text-center text-xs">Looks like this wallet hasn't purchased yet</p>
        </div>`;
    }
  }
}

// Fetch wallet tokens for the claim section
async function fetchWalletTokens() {
  if (!wallet?.publicKey) {
    // Reset claim state if wallet is not connected
    resetClaimState();
    return;
  }
  
  try {
    const res = await fetch(`https://froggle3-0.onrender.com/api/purchases?wallet=${wallet.publicKey.toString()}`);
    const data = await res.json();
    
    if (!data.success || data.purchases.length === 0) {
      const onchain = await getWalletPurchasesOnchain();
      if (onchain.length === 0) {
        resetClaimState();
        return;
      }
      data = { purchases: onchain, success: true };
    }
    
    // Update claim wallet status UI
    const claimWalletStatus = document.getElementById('claimWalletStatus');
    if (claimWalletStatus) {
      claimWalletStatus.innerHTML = `
        <div class="py-0 px-1 bg-white rounded-lg text-center wallet-connected-compact">
          <p class="text-frogBlack text-xs mb-0">Wallet connected</p>
          <p class="text-xs text-green-600">${shortAddr(wallet.publicKey.toString())}</p>
        </div>
      `;
    }
    
    // Filtra le transazioni simulate o di test, stessa logica usata in fetchActivity
    const realPurchases = data.purchases.filter(p => {
      // Escludi transazioni che iniziano con SIMULATED
      if (p.transactionId.startsWith('SIMULATED')) return false;
      
      // Escludi anche transazioni che contengono parole chiave di test
      if (p.transactionId.includes('test') || 
          p.transactionId.includes('devnet') || 
          p.transactionId.includes('testnet') ||
          p.transactionId.length < 20) return false;
          
      return true;
    });

    // Calcola totale basato solo su transazioni reali
    const realTotal = realPurchases.reduce((sum, p) => sum + p.froggleAmount, 0);
    
    // Calculate USD value at listing price (usando il prezzo corretto di $0.003)
    const listingPrice = 0.003; // Modificato da 0.006 a 0.003 (X3 invece di X6)
    const usdValue = realTotal * listingPrice;
    
    console.log("Debug valore USD:", { realTotal, listingPrice, usdValue });
    
    // Calculate referral earnings (per esempio 5% del totale, da implementare)
    const referralEarnings = 0; // Placeholder, da implementare in futuro
    
    // Update token balance UI - Uso lo stesso selettore di resetClaimState
    const claimBalanceElements = document.querySelectorAll('#howtoclaim .text-xl.font-black.text-frogBlack');
    if (claimBalanceElements && claimBalanceElements.length > 0) {
      // Aggiorna il saldo dei token FROGGLE - usando 2 decimali e virgola come separatore
      const formattedFroggle = Number(realTotal).toFixed(2).replace('.', ',');
      
      claimBalanceElements[0].textContent = `${formattedFroggle} $FROGGLE`;
      
      // Aggiorna il valore in USD al prezzo di listing
      if (claimBalanceElements.length > 1) {
        // Formatto il valore con due decimali e virgola come separatore decimale
        const formattedUSD = Number(usdValue).toFixed(2).replace('.', ',');
        
        claimBalanceElements[1].textContent = `${formattedUSD} USD`;
      }
      
      // Aggiorna i guadagni da referral
      if (claimBalanceElements.length > 2) {
        claimBalanceElements[2].textContent = `${referralEarnings.toLocaleString()} $FROGGLE`;
      }
    } else {
      console.error("Elementi di claim non trovati usando il selettore '#howtoclaim .text-xl.font-black.text-frogBlack'");
    }
    
    console.log(`Updated claim section with ${realTotal.toLocaleString()} tokens worth $${usdValue.toFixed(2)}`);
    
  } catch (error) {
    console.error('Error fetching wallet tokens:', error);
    resetClaimState();
  }
}

// Aggiorniamo la funzione refreshProgress per aggiornare i dati del claim ma conservando le funzionalità esistenti
async function refreshProgress() {
  try {
    console.log("=== REFRESHING PROGRESS BAR ===");
    
    // Richiedi i dati reali dal backend invece di usare dati simulati
    const response = await fetch('https://froggle3-0.onrender.com/api/total-raised');
    const data = await response.json();
    
    if (!data.success) {
      console.error("Failed to fetch data from server:", data);
      return;
    }
    
    // Usa i dati reali per aggiornare l'interfaccia
    const totalRaisedUSD = data.totalRaisedUSD;
    const tokensSold = data.tokensSold;
    const goalUSD = data.goalUSD;
    
    // Calculate the percentage (cap at 100%)
    const rawPercentage = (totalRaisedUSD / goalUSD) * 100;
    const displayPercentage = Math.min(100, rawPercentage);
    
    console.log(`Using real mainnet data: ${data.mainnetTransactions} valid transactions`);
    console.log(`Raw percentage calculation: $${totalRaisedUSD} / $${goalUSD} = ${rawPercentage.toFixed(2)}%`);
    console.log(`Display percentage (capped): ${displayPercentage.toFixed(1)}%`);
    
    // Get all the elements we need to update
    const progressBar = document.getElementById('presaleProgress');
    const progressText = document.getElementById('presaleProgressText');
    const raisedInfo = document.getElementById('raisedUSDInfo');
    const soldText = document.getElementById('tokensSold');
    
    // Update the progress bar with a forced redraw
    if (progressBar) {
      console.log(`Setting progress bar width to ${displayPercentage}%`);
      
      // Aggiungi e rimuovi la classe per forzare il redraw
      progressBar.classList.add('refresh-display');
      
      // Force update the DOM by directly modifying the element's width
      progressBar.setAttribute('style', `width: ${displayPercentage}% !important`);
      
      // Rimuovi la classe dopo un breve periodo
      setTimeout(() => {
        progressBar.classList.remove('refresh-display');
      }, 100);
      
      // Salva la percentuale corrente come attributo di data-
      progressBar.dataset.currentPercentage = displayPercentage;
    } else {
      console.error("Progress bar element not found!");
    }
    
    // Update the percentage text
    if (progressText) {
      progressText.textContent = `${displayPercentage.toFixed(1)}%`;
    }
    
    // Update amount raised text
    if (raisedInfo) {
      raisedInfo.innerHTML = `$${totalRaisedUSD.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })} / ${goalUSD.toLocaleString()}$ collected`;
    }
    
    // Update tokens sold if element exists
    if (soldText) {
      soldText.textContent = tokensSold.toLocaleString();
    }
    
    // Aggiorna il numero di token nella sezione How to Claim
    // ma solo se il wallet è connesso
    if (wallet?.publicKey) {
      if (typeof fetchWalletTokens === 'function') {
        try {
          await fetchWalletTokens();
          console.log("Claim token data aggiornati con successo");
        } catch (error) {
          console.error("Errore durante l'aggiornamento dei token:", error);
        }
      }
    }
    
    console.log("=== PROGRESS BAR REFRESH COMPLETE ===");
  } catch (err) {
    console.error('Failed to refresh progress:', err);
  }
}

// Aggiorna le informazioni sui tassi di cambio nell'interfaccia
async function updateExchangeRatesInfo(currency = 'SOL') {
  const exchangeRatesInfo = document.getElementById('exchangeRatesInfo');
  if (exchangeRatesInfo) {
    if (currency === 'SOL') {
      // Ottieni il prezzo SOL aggiornato in tempo reale
      const solPrice = await getSolPrice();
      console.log(`Prezzo SOL aggiornato per UI rates: $${solPrice} USD`);
      
      // Ricalcola TOKENS_PER_SOL in base al prezzo corrente
      const frogglePrice = 0.00098; // Prezzo fisso di FROGGLE
      const calculatedTokensPerSol = solPrice / frogglePrice;
      
      // Aggiorna la variabile globale per garantire coerenza
      TOKENS_PER_SOL = calculatedTokensPerSol;
      
      console.log(`TOKENS_PER_SOL aggiornato a: ${calculatedTokensPerSol.toFixed(2)} (${solPrice} / ${frogglePrice})`);
      
      // Aggiungi timestamp dell'aggiornamento
      const now = new Date();
      const timeString = now.toLocaleTimeString();
      
      // Formatta il valore con separatori di migliaia
      const formattedTokensValue = Math.floor(calculatedTokensPerSol).toLocaleString();
      
      exchangeRatesInfo.innerHTML = `
        <span class="text-green-500">1 SOL = ${formattedTokensValue} FROGGLE</span><br>
        <span class="text-green-500">SOL Prezzo: $${solPrice.toFixed(2)} USD</span><br>
        <span class="text-xs text-gray-500">Aggiornato: ${timeString}</span>
      `;
      
      // Aggiungi la classe per l'animazione di aggiornamento
      exchangeRatesInfo.classList.add('price-updated');
      setTimeout(() => exchangeRatesInfo.classList.remove('price-updated'), 2000);
      
      // Aggiorna il campo di input se presente
      if (typeof updateInputValues === 'function') {
        // Abbiamo già aggiornato TOKENS_PER_SOL, quindi non dobbiamo farlo di nuovo
        // Solo aggiorna i valori di input basati sul nuovo tasso
        const solInput = document.getElementById('solAmount');
        const tokenOutput = document.getElementById('tokenAmount');
        
        if (solInput && tokenOutput && solInput.value) {
          const amount = parseFloat(solInput.value) || 0;
          const tokenAmount = Math.floor(amount * TOKENS_PER_SOL);
          tokenOutput.value = tokenAmount.toLocaleString();
          
          console.log(`Aggiornamento diretto del valore token: ${amount} SOL * ${TOKENS_PER_SOL.toFixed(2)} = ${tokenAmount} FROGGLE`);
        }
      }
    } else if (currency === 'USDT') {
      exchangeRatesInfo.innerHTML = `
        <span class="text-green-500">1 USDT = ${Math.floor(TOKENS_PER_USDT).toLocaleString()} FROGGLE</span><br>
        <span class="text-green-500">USDT Prezzo: $1.00 USD</span>
      `;
      
      // Aggiungi la classe per l'animazione di aggiornamento
      exchangeRatesInfo.classList.add('price-updated');
      setTimeout(() => exchangeRatesInfo.classList.remove('price-updated'), 2000);
    }
  }
}

// Reset claim state if wallet is not connected
function resetClaimState() {
  // Reset dei valori di claim
  const claimBalanceElements = document.querySelectorAll('#howtoclaim .text-xl.font-black.text-frogBlack');
  if (claimBalanceElements.length > 0) {
    claimBalanceElements[0].textContent = "0 $FROGGLE";
    claimBalanceElements[1].textContent = "0 USD";
  }
  
  // Reset claim wallet status UI
  const claimWalletStatus = document.getElementById('claimWalletStatus');
  if (claimWalletStatus) {
    claimWalletStatus.innerHTML = `
      <p class="text-frogBlack">Please connect your wallet to check claim status</p>
    `;
  }
}

// Nel codice esistente, aggiungiamo una funzione di disconnessione più robusta
async function disconnectWallet() {
  try {
    if (wallet && typeof wallet.disconnect === 'function') {
      await wallet.disconnect();
    } else if (window.solana && typeof window.solana.disconnect === 'function') {
      await window.solana.disconnect();
    }
    wallet = null;
    
    // Update UI
    const walletAddrElem = document.getElementById("walletAddress");
    if (walletAddrElem) walletAddrElem.textContent = "Not Connected";
    
    // Update nav button text
    const navBtn = document.getElementById('navConnectWalletBtn');
    if (navBtn) navBtn.textContent = "Connect Wallet";
    
    const connectBtns = document.querySelectorAll('.connect-wallet');
    connectBtns.forEach(btn => {
      btn.textContent = "CONNECT WALLET";
      btn.classList.remove('bg-green-500');
    });
    
    // Reset claim status
    resetClaimState();
    
    // Reset activity modal content
    const walletTransactions = document.getElementById('walletTransactions');
    if (walletTransactions) {
      walletTransactions.innerHTML = `
        <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2">
          <svg class="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 7h-1V6c0-1.1-.9-2-2-2H8C6.9 4 6 4.9 6 6v1H5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-7 10H5V9h7v8zm8 0h-6v-8h6v8zm-9-10V6h4v1h-4z"></path>
          </svg>
        </div>
        <p class="text-base font-semibold text-center mb-1">No Transactions yet</p>
        <p class="text-gray-500 text-center text-xs">Start trading on dApps<br>to grow your wallet!</p>
      `;
    }
    
    // Nascondere il modal se aperto
    const walletManagementModal = document.getElementById('walletManagementModal');
    if (walletManagementModal) {
      walletManagementModal.classList.add('hidden');
    }
    
    console.log("Wallet disconnected successfully");
  } catch (error) {
    console.error("Error disconnecting wallet:", error);
  }
}

// Esponi le funzioni nel contesto globale
if (typeof window !== 'undefined') {
  window.connectWallet = connectWallet;
  window.buyTokensWithValidation = buyTokensWithValidation;
  window.buyWithUSDTValidation = buyWithUSDTValidation;
  window.fetchActivity = fetchActivity;
  window.fetchWalletTokens = fetchWalletTokens;
  window.updateExchangeRatesInfo = updateExchangeRatesInfo;
  window.addFroggleToWallet = addFroggleToWallet;
  window.disconnectWallet = disconnectWallet;
}

// Aggiorniamo la funzione updateInputValues per supportare il controllo del minimo acquisto
async function updateInputValues() {
  console.log("Aggiornamento dei valori di input con il nuovo tasso di cambio");
  
  // Recupera il prezzo SOL aggiornato PRIMA di fare qualsiasi calcolo
  const solPrice = await getSolPrice();
  console.log(`Prezzo SOL attuale per calcolo: $${solPrice} USD`);
  
  // Ricalcolo immediato di TOKENS_PER_SOL in base al prezzo corrente di SOL
  const frogglePrice = 0.00098; // Prezzo fisso di FROGGLE
  TOKENS_PER_SOL = solPrice / frogglePrice;
  console.log(`TOKENS_PER_SOL aggiornato a: ${TOKENS_PER_SOL.toFixed(2)} (${solPrice} / ${frogglePrice})`);
  
  // Aggiorna il campo di input per il calcolo dei token, se presente e ha un valore
  const solInput = document.getElementById('solAmount');
  const tokenOutput = document.getElementById('tokenAmount');
  
  if (solInput && tokenOutput) {
    // Recupera le informazioni sulla valuta corrente
    const currencySymbol = document.getElementById('currencyLabel');
    const currentCurrency = currencySymbol ? currencySymbol.textContent : 'SOL';
    
    console.log(`Aggiornamento valore input da ${solInput.value} ${currentCurrency}`);
    
    // In base alla valuta, calcola i token
    const amount = parseFloat(solInput.value) || 0;
    let tokenAmount = 0;
    
    if (currentCurrency === 'SOL') {
      // Per SOL, usa TOKENS_PER_SOL (appena ricalcolato)
      tokenAmount = Math.floor(amount * TOKENS_PER_SOL);
      console.log(`Calcolo token: ${amount} SOL * ${TOKENS_PER_SOL.toFixed(2)} = ${tokenAmount} FROGGLE`);
      
      // Controlla l'importo minimo in USD
      const usdValue = amount * solPrice;
      
      // Aggiorna il messaggio di errore o il calcolo
      const calculationDetailsElement = document.getElementById('calculationDetails');
      if (calculationDetailsElement) {
        if (usdValue < MIN_PURCHASE_USD && amount > 0) {
          const minSolAmount = (MIN_PURCHASE_USD / solPrice).toFixed(3);
          showMinimumAmountError('SOL', minSolAmount);
        } else if (amount > 0) {
          calculationDetailsElement.innerHTML = `
            <span class="text-green-500 font-semibold">1 SOL = ${Math.floor(TOKENS_PER_SOL).toLocaleString()} FROGGLE</span>
          `;
          calculationDetailsElement.classList.remove('hidden');
        } else {
          clearMinimumAmountError();
        }
      }
    } else {
      // Per USDT, usa TOKENS_PER_USDT
      tokenAmount = Math.floor(amount * TOKENS_PER_USDT);
      console.log(`Calcolo token: ${amount} USDT * ${TOKENS_PER_USDT.toFixed(2)} = ${tokenAmount} FROGGLE`);
      
      // Controlla l'importo minimo in USDT
      const calculationDetailsElement = document.getElementById('calculationDetails');
      if (calculationDetailsElement) {
        if (amount < MIN_PURCHASE_USD && amount > 0) {
          showMinimumAmountError('USDT', MIN_PURCHASE_USD);
        } else if (amount > 0) {
          calculationDetailsElement.innerHTML = `
            <span class="text-green-500 font-semibold">1 USDT = ${Math.floor(TOKENS_PER_USDT).toLocaleString()} FROGGLE</span>
          `;
          calculationDetailsElement.classList.remove('hidden');
        } else {
          clearMinimumAmountError();
        }
      }
    }
    
    console.log(`Nuovo valore token calcolato: ${tokenAmount}`);
    tokenOutput.value = tokenAmount.toLocaleString();
    
    // Forza un'animazione per mostrare che il valore è stato aggiornato
    tokenOutput.classList.add('price-updated');
    setTimeout(() => {
      tokenOutput.classList.remove('price-updated');
    }, 2000);
  } else {
    console.log("Campo di input o output non trovato o senza valore");
  }
}

// Funzione per recuperare le informazioni sul token FROGGLE dal server
async function fetchFroggleTokenInfo() {
  try {
    const response = await fetch('https://froggle3-0.onrender.com/api/token-info');
    const data = await response.json();
    
    if (data.success && data.tokenInfo) {
      froggleTokenInfo = data.tokenInfo;
      console.log("FROGGLE Token Info:", froggleTokenInfo);
      return froggleTokenInfo;
    } else {
      console.error("Errore nel recupero delle informazioni sul token FROGGLE:", data.message);
      // Fallback a valori predefiniti se il server non risponde
      return {
        mintAddress: FROGGLE_MINT_ADDRESS,
        decimals: 9,
        network: "mainnet",
        name: "FROGGLE",
        symbol: "FROG"
      };
    }
  } catch (error) {
    console.error("Errore nella chiamata API per il token FROGGLE:", error);
    // Fallback a valori predefiniti in caso di errore
    return {
      mintAddress: FROGGLE_MINT_ADDRESS,
      decimals: 9,
      network: "mainnet",
      name: "FROGGLE",
      symbol: "FROG"
    };
  }
}

// Funzione per aggiungere il token FROGGLE al wallet Phantom
async function addFroggleToWallet() {
  if (!wallet || !wallet.isConnected) {
    console.error("Wallet non connesso");
    alert("Per favore, connetti prima il tuo wallet Phantom");
    return false;
  }
  
  try {
    // Assicuriamoci di avere le informazioni sul token
    if (!froggleTokenInfo) {
      froggleTokenInfo = await fetchFroggleTokenInfo();
    }
    
    // Utilizziamo il metodo standard di Phantom per aggiungere token
    const mintAddress = froggleTokenInfo.mintAddress;
    console.log("Tentativo di aggiungere token con indirizzo:", mintAddress);
    
    // URL per l'immagine del token - usiamo un'immagine locale o un URL assoluto
    const imageUrl = `${window.location.origin}/images/froggle-logo.png`;
    console.log("URL immagine token:", imageUrl);
    
    // Metodi aggiornati per aggiungere token a Phantom con metadati completi
    let response;
    
    // Primo tentativo: metodo wallet_watchAsset
    try {
      console.log("Tentativo con metodo wallet_watchAsset (SPL)...");
      response = await wallet.request({
        method: "wallet_watchAsset",
        params: {
          type: "SPL",
          options: {
            address: mintAddress,
            decimals: 9,
            symbol: "FROGGLE",
            name: "FROGGLE Token",
            image: imageUrl,
            tokenName: "FROGGLE Token",
          },
        },
      });
      console.log("Risultato primo metodo:", response);
    } catch (firstError) {
      console.warn("Primo metodo fallito:", firstError);
      
      // Secondo tentativo: metodo wallet_watchAsset con tipo spl-token
      try {
        console.log("Tentativo con metodo wallet_watchAsset (spl-token)...");
        response = await wallet.request({
          method: "wallet_watchAsset",
          params: {
            type: "spl-token",
            options: {
              address: mintAddress,
              decimals: 9,
              symbol: "FROGGLE",
              name: "FROGGLE Token",
              image: imageUrl,
              tokenName: "FROGGLE Token",
              logoURI: imageUrl
            },
          },
        });
        console.log("Risultato secondo metodo:", response);
      } catch (secondError) {
        console.warn("Secondo metodo fallito:", secondError);
        
        // Terzo tentativo: metodo specifico di Phantom
        try {
          console.log("Tentativo con metodo Phantom specifico...");
          // Utilizziamo direttamente window.solana se è Phantom
          if (window.solana && window.solana.isPhantom) {
            const tokenData = {
              mintAddress: mintAddress,
              tokenName: "FROGGLE Token",
              tokenSymbol: "FROGGLE",
              tokenDecimals: 9,
              tokenImage: imageUrl
            };
            
            // Primo tentativo con wallet_addToken
            try {
              response = await window.solana.request({
                method: 'wallet_addToken',
                params: {
                  token: new PublicKey(mintAddress),
                  name: "FROGGLE Token",
                  symbol: "FROGGLE",
                  decimals: 9,
                  image: imageUrl
                }
              });
            } catch (addTokenError) {
              console.warn("Phantom wallet_addToken fallito:", addTokenError);
              
              // Ultimo tentativo con wallet_manageTokens
              try {
                response = await window.solana.request({
                  method: 'wallet_manageTokens',
                  params: {
                    action: 'add',
                    tokens: [tokenData]
                  }
                });
              } catch (manageTokensError) {
                console.error("Tutti i metodi Phantom falliti:", manageTokensError);
                throw new Error("Nessun metodo Phantom supportato per aggiungere token");
              }
            }
          } else {
            throw new Error("Phantom non disponibile");
          }
        } catch (thirdError) {
          console.error("Tutti i metodi falliti:", thirdError);
          
          // Ultimo tentativo generico
          alert("Problema nell'aggiunta automatica del token. Per favore aggiungi manualmente il token in Phantom usando questo indirizzo: " + mintAddress);
          return false;
        }
      }
    }
    
    if (response) {
      console.log("FROGGLE token aggiunto con successo al wallet:", response);
      alert("FROGGLE token aggiunto con successo al tuo wallet!");
      return true;
    } else {
      console.error("Errore nell'aggiunta del token al wallet: nessuna risposta");
      alert("Non è stato possibile aggiungere automaticamente il token. Per favore aggiungi manualmente il token in Phantom usando questo indirizzo: " + mintAddress);
      return false;
    }
  } catch (error) {
    console.error("Errore durante l'aggiunta del token FROGGLE al wallet:", error);
    alert("Errore durante l'aggiunta del token. Per favore aggiungi manualmente il token in Phantom usando questo indirizzo: 4b48dmT8DpV5PDkbuuXVgL9gKqSE9t1TwYVKkyFy1iRK");
    return false;
  }
}

// Funzioni per gestire il modale di selezione wallet
function openWalletModal() {
  const modal = document.getElementById('walletModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeWalletModal() {
  const modal = document.getElementById('walletModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Controlla se un wallet è già connesso all'avvio
async function checkWalletConnection() {
  try {
    console.log("Verifico se un wallet è già connesso...");
    
    // Controlla tutti i provider disponibili
    let connectedProvider = null;
    
    // Phantom
    if (window.solana && window.solana.isPhantom && window.solana.isConnected) {
      console.log("Phantom wallet già connesso");
      connectedProvider = window.solana;
    }
    // Solflare
    else if (window.solflare && window.solflare.isConnected) {
      console.log("Solflare wallet già connesso");
      connectedProvider = window.solflare;
    }
    // Backpack
    else if (window.backpack && window.backpack.isConnected) {
      console.log("Backpack wallet già connesso");
      connectedProvider = window.backpack;
    }
    // Brave
    else if (window.braveSolana && window.braveSolana.isConnected) {
      console.log("Brave wallet già connesso");
      connectedProvider = window.braveSolana;
    }
    
    // Se abbiamo trovato un provider connesso, impostiamolo come wallet attivo
    if (connectedProvider) {
      try {
        const resp = await connectedProvider.connect({ onlyIfTrusted: true });
        const publicKey = resp.publicKey;
        
        // Imposta globalmente
        wallet = connectedProvider;
        walletPublicKey = publicKey;
        console.log("Wallet già connesso rilevato:", publicKey.toString());
        
        // Aggiorna UI
        document.querySelectorAll('.connect-wallet').forEach(button => {
          button.textContent = shortAddr(publicKey.toString());
          button.classList.add('bg-green-500');
        });
        
        const walletAddrElem = document.getElementById("walletAddress");
        if (walletAddrElem) walletAddrElem.textContent = shortAddr(publicKey.toString());
        
        // Aggiorna stato nella sezione claim
        const claimWalletStatus = document.getElementById('claimWalletStatus');
        if (claimWalletStatus) {
          claimWalletStatus.innerHTML = `
            <div class="py-0 px-1 bg-white rounded-lg text-center wallet-connected-compact">
              <p class="text-frogBlack text-xs mb-0">Wallet connected</p>
              <p class="text-xs text-green-600">${shortAddr(publicKey.toString())}</p>
            </div>
          `;
        }
        
        // Tenta di recuperare i token del wallet e aggiornare il progress
        if (typeof window.fetchWalletTokens === 'function') {
          try {
            await window.fetchWalletTokens();
          } catch (e) {
            console.error("Errore durante fetchWalletTokens:", e);
          }
        }
        
        if (typeof refreshProgress === 'function') {
          try {
            await refreshProgress();
          } catch (e) {
            console.error("Errore durante refreshProgress:", e);
          }
        }
        
        return publicKey;
      } catch (error) {
        console.warn("Tentativo di riconnessione fallito:", error.message);
        console.log("L'utente dovrà riconnettersi esplicitamente");
      }
    } else {
      console.log("Nessun wallet connesso trovato");
    }
    
    return null;
  } catch (error) {
    console.error("Errore durante il controllo della connessione:", error);
    return null;
  }
}

// Calculate token amount from SOL
function calculateTokenAmount(solAmount, presaleInfo) {
  // Aggiungo log dettagliato per debugging
  console.log(`Calcolo token per ${solAmount} SOL:`);
  console.log(`- tokensPerSol: ${presaleInfo.tokensPerSol}`);
  console.log(`- Importo base: ${solAmount} SOL * ${presaleInfo.tokensPerSol} = ${solAmount * presaleInfo.tokensPerSol} FROGGLE`);
  
  const baseAmount = solAmount * presaleInfo.tokensPerSol;
  // Rimosso il bonus del 15%
  const totalAmount = baseAmount;
  console.log(`- Totale: ${baseAmount} FROGGLE`);
  
  // Update UI if needed
  const bonusAmountElement = document.getElementById('bonusAmount');
  const totalAmountElement = document.getElementById('totalAmount');
  const calculationDetailsElement = document.getElementById('calculationDetails');
  
  if (bonusAmountElement) {
    bonusAmountElement.textContent = '0 $FROGGLE';
  }
  
  if (totalAmountElement) {
    totalAmountElement.textContent = Math.floor(totalAmount).toLocaleString() + ' $FROGGLE';
  }
  
  // Mostra i dettagli del calcolo all'utente
  if (calculationDetailsElement) {
    // Controlla l'importo minimo in USD
    const solPrice = presaleInfo.solPriceUSD || 155.16; // Fallback se non disponibile
    const usdValue = solAmount * solPrice;
    
    if (usdValue < MIN_PURCHASE_USD) {
      const minSolAmount = (MIN_PURCHASE_USD / solPrice).toFixed(3);
      showMinimumAmountError('SOL', minSolAmount);
    } else {
      calculationDetailsElement.innerHTML = `
        <span class="text-green-500 font-semibold">1 SOL = ${Math.floor(presaleInfo.tokensPerSol).toLocaleString()} FROGGLE</span>
      `;
      calculationDetailsElement.classList.remove('hidden');
    }
  }
  
  return Math.floor(totalAmount);
}

// Calculate token amount from USDT
function calculateTokenAmountFromUSDT(usdtAmount, presaleInfo) {
  // Aggiungo log dettagliato per debugging
  console.log(`Calcolo token per ${usdtAmount} USDT:`);
  console.log(`- tokensPerUSDT: ${presaleInfo.tokensPerUSDT}`);
  console.log(`- Importo base: ${usdtAmount} USDT * ${presaleInfo.tokensPerUSDT} = ${usdtAmount * presaleInfo.tokensPerUSDT} FROGGLE`);
  
  const baseAmount = usdtAmount * presaleInfo.tokensPerUSDT;
  // Rimosso il bonus del 15%
  const totalAmount = baseAmount;
  console.log(`- Totale: ${baseAmount} FROGGLE`);
  
  // Update UI if needed
  const bonusAmountElement = document.getElementById('bonusAmount');
  const totalAmountElement = document.getElementById('totalAmount');
  const calculationDetailsElement = document.getElementById('calculationDetails');
  
  if (bonusAmountElement) {
    bonusAmountElement.textContent = '0 $FROGGLE';
  }
  
  if (totalAmountElement) {
    totalAmountElement.textContent = Math.floor(totalAmount).toLocaleString() + ' $FROGGLE';
  }
  
  // Mostra i dettagli del calcolo all'utente
  if (calculationDetailsElement) {
    // Controlla l'importo minimo in USDT
    if (usdtAmount < MIN_PURCHASE_USD) {
      showMinimumAmountError('USDT', MIN_PURCHASE_USD);
    } else {
      calculationDetailsElement.innerHTML = `
        <span class="text-green-500 font-semibold">1 USDT = ${Math.floor(presaleInfo.tokensPerUSDT).toLocaleString()} FROGGLE</span>
      `;
      calculationDetailsElement.classList.remove('hidden');
    }
  }
  
  return Math.floor(totalAmount);
}

// Aggiungi gestione del disclaimer
function setupDisclaimerButton() {
    const disclaimerButton = document.getElementById('acceptDisclaimer');
    const disclaimerModal = document.getElementById('disclaimerModal');
    
    if (disclaimerButton && disclaimerModal) {
        disclaimerButton.addEventListener('click', function() {
            localStorage.setItem('disclaimerAccepted', 'true');
            disclaimerModal.style.display = 'none';
            console.log('Disclaimer accettato e nascosto');
        });
    }
    
    // Nascondi disclaimer se già accettato
    if (localStorage.getItem('disclaimerAccepted') === 'true' && disclaimerModal) {
        disclaimerModal.style.display = 'none';
    }
}

// Chiamare questa funzione all'avvio
document.addEventListener('DOMContentLoaded', function() {
    setupDisclaimerButton();
});

// Helper per ottenere il provider Phantom su tutti gli ambienti (desktop extension e mobile in-app browser)
function getPhantomProvider() {
  if (window.solana && window.solana.isPhantom) return window.solana;
  if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
  return null;
}

// Funzione per connettere il wallet quando è già rilevato
async function connectDetectedWallet(provider) {
  if (!provider) {
    console.error("Tentativo di connessione con provider nullo");
    return null;
  }

  try {
    const res = await provider.connect();
    console.log("Wallet connesso con successo:", res.publicKey.toString());
    
    // Aggiorna UI per il wallet connesso
    const walletAddrElem = document.getElementById("walletAddress");
    if (walletAddrElem) walletAddrElem.textContent = res.publicKey.toString();
    
    // Aggiorna i pulsanti
    document.querySelectorAll('.connect-wallet').forEach(btn => {
      btn.textContent = shortAddr(res.publicKey.toString());
      btn.classList.add('bg-green-500');
    });

    // Aggiorna stato pulsanti di gestione
    const manageWalletBtn = document.getElementById('manageWalletBtn');
    if (manageWalletBtn) manageWalletBtn.style.display = '';
    
    const stageConnectWalletBtn = document.getElementById('stageConnectWalletBtn');
    if (stageConnectWalletBtn) stageConnectWalletBtn.style.display = 'none';
    
    // Imposta wallet globalmente
    window.wallet = provider;
    wallet = provider;
    if (res && res.publicKey) {
      window.walletPublicKey = res.publicKey;
      walletPublicKey = res.publicKey; // mantiene compatibilità con codice legacy
    }
    
    // Aggiorna anche sezione claim
    const claimWalletStatus = document.getElementById('claimWalletStatus');
    if (claimWalletStatus) {
      claimWalletStatus.innerHTML = `
        <div class="py-0 px-1 bg-white rounded-lg text-center wallet-connected-compact">
          <p class="text-frogBlack text-xs mb-0">Wallet connected</p>
          <p class="text-xs text-green-600">${shortAddr(res.publicKey.toString())}</p>
        </div>
      `;
    }
    
    // Tenta di recuperare i token del wallet e aggiornare il progress
    if (typeof window.fetchWalletTokens === 'function') {
      try {
        await window.fetchWalletTokens();
      } catch (e) {
        console.error("Errore durante fetchWalletTokens:", e);
      }
    }
    
    if (typeof refreshProgress === 'function') {
      try {
        await refreshProgress();
      } catch (e) {
        console.error("Errore durante refreshProgress:", e);
      }
    }
    
    return res;
  } catch (err) {
    console.error("Errore durante la connessione:", err);
    alert("Errore durante la connessione: " + (err.message || "Errore sconosciuto"));
    return null;
  }
}

// ------------------------------------------------------------
// Helper: show disclaimer overlay for mobile Phantom users
// ------------------------------------------------------------
function showMobileWalletDisclaimer(walletName = 'this wallet') {
  if (document.getElementById('mobileWalletDisclaimer')) return; // already visible

  const overlay = document.createElement('div');
  overlay.id = 'mobileWalletDisclaimer';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  overlay.innerHTML = `
    <div style="background:#FFFFFF; color:#000000; max-width:320px; padding:20px 24px; border-radius:1.5rem; text-align:center; font-family:'Poppins', sans-serif; box-shadow:0 8px 24px rgba(0,0,0,0.3);">
      <h3 style="font-size:20px; margin:0 0 10px 0; font-weight:700; color:#4B0076;">Connect with ${walletName.charAt(0).toUpperCase()+walletName.slice(1)}</h3>
      <p style="font-size:14px; line-height:1.4; margin-bottom:18px; color:#000000;">To connect your wallet on mobile, open the <strong>${walletName}</strong> app, tap the <strong>Browser</strong> icon and navigate to:<br><span style='word-break:break-all; color:#4B0076; font-weight:bold;'>${window.location.origin}</span></p>
      <button id="closePhantomDisclaimer" style="background:#C8A2C8; color:#000000; font-weight:700; padding:8px 20px; border-radius:999px; border:none;">Got it</button>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('closePhantomDisclaimer').onclick = () => overlay.remove();
}

// Expose globally
window.showMobileWalletDisclaimer = showMobileWalletDisclaimer;

// Utility: suppress identical alerts fired in rapid succession (e.g., duplicate event listeners on mobile)
if (!window.__alertDedupWrapped) {
  (function () {
    const originalAlert = window.alert;
    let lastMsg = null;
    let lastTime = 0;
    window.alert = function (msg) {
      const now = Date.now();
      if (msg === lastMsg && now - lastTime < 1000) return;
      lastMsg = msg;
      lastTime = now;
      originalAlert(msg);
    };
  })();
  window.__alertDedupWrapped = true;
}

// ---------------------------------------------------------------------------
//  On-chain fallback: fetch purchases directly from Solana
// ---------------------------------------------------------------------------
async function decodePurchaseFromTransaction(tx) {
  if (!tx || !tx.transaction) return null;

  const signature = tx.transaction.signatures[0];
  const timestamp = (tx.blockTime || 0) * 1000;

  // --- SOL transfers (parsed) ---
  for (const instr of tx.transaction.message.instructions) {
    if (!instr.parsed) continue;
    if (instr.program === 'system' && instr.parsed.type === 'transfer') {
      const dest = instr.parsed.info.destination;
      const adminDest = (typeof adminWallet === 'string' && adminWallet) ? adminWallet : ADMIN_WALLET_FALLBACK;
      if (dest === adminDest) {
        const lamports = Number(instr.parsed.info.lamports);
        const solAmt = lamports / LAMPORTS_PER_SOL;
        return {
          currency: 'SOL',
          amountSOL: solAmt,
          froggleAmount: solAmt * TOKENS_PER_SOL,
          transactionId: signature,
          timestamp
        };
      }
    }
  }

  // --- USDT SPL transfers --- (optional)
  if (FROGGLE_ADMIN_TOKEN_ACCOUNT) {
    for (const inner of tx.meta?.innerInstructions || []) {
      for (const instr of inner.instructions) {
        if (instr.programId.toString() === TOKEN_PROGRAM_ID.toString() && instr.parsed) {
          const info = instr.parsed.info;
          const adminDest = (typeof FROGGLE_ADMIN_TOKEN_ACCOUNT === 'string' && FROGGLE_ADMIN_TOKEN_ACCOUNT) ? FROGGLE_ADMIN_TOKEN_ACCOUNT : null;
          if (adminDest && info && info.destination === adminDest && info.mint === USDT_TOKEN_ADDRESS) {
            const rawAmt = parseInt(info.amount, 10);
            const usdtAmt = rawAmt / 1e6; // 6 decimals
            return {
              currency: 'USDT',
              amountUSDT: usdtAmt,
              froggleAmount: usdtAmt * TOKENS_PER_USDT,
              transactionId: signature,
              timestamp
            };
          }
        }
      }
    }
  }

  return null;
}

async function getWalletPurchasesOnchain(limit = 1000) {
  if (!wallet?.publicKey) return [];
  try {
    const sigs = await connection.getSignaturesForAddress(wallet.publicKey, { limit });
    const out = [];
    for (const s of sigs) {
      const tx = await connection.getParsedTransaction(s.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      const purchase = await decodePurchaseFromTransaction(tx);
      if (purchase) out.push(purchase);
    }
    return out;
  } catch (err) {
    console.error('On-chain fetch error:', err);
    return [];
  }
}

// Helper to render purchases array (either backend or on-chain) into activity modal
function renderActivity(purchasesArr) {
  const container = document.getElementById('walletTransactions');
  if (!container) return;

  if (purchasesArr.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-4">
        <svg class="w-12 h-12 text-gray-300 mb-2" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 7h-1V6c0-1.1-.9-2-2-2H8C6.9 4 6 4.9 6 6v1H5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-7 10H5V9h7v8zm8 0h-6v-8h6v8zm-9-10V6h4v1h-4z"></path>
        </svg>
        <p class="text-base font-semibold text-center mb-1">No transactions found</p>
        <p class="text-gray-500 text-center text-xs">Looks like this wallet hasn't purchased yet</p>
      </div>`;
    return;
  }

  let html = '<div class="space-y-2">';
  let total = 0;
  purchasesArr.forEach(p => {
    const date = new Date(p.timestamp);
    const formatted = `${date.toLocaleDateString()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
    total += p.froggleAmount;
    html += `
      <div class="transaction-item bg-white">
        <div class="transaction-date">${formatted}</div>
        <div class="transaction-amount"><span class="text-gray-800 font-medium">${p.currency} ${p.currency==='SOL'?p.amountSOL.toFixed(3):p.amountUSDT}</span> <span class="text-green-600 font-semibold">+${Math.floor(p.froggleAmount).toLocaleString()} $FROGGLE</span></div>
        <div class="px-2 pb-2 text-xs font-bold text-black">TX: <span class="text-black">${p.transactionId.slice(0,8)}…</span></div>
      </div>`;
  });
  html += `<div class="total-row text-black font-bold mt-4 px-2 py-2 bg-gray-200 rounded-lg">Total: ${Math.floor(total).toLocaleString()} $FROGGLE</div>`;
  html += '</div>';
  container.innerHTML = html;
}