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

// Network settings
const NETWORK = "mainnet-beta"; // Aggiornato per il deploy in produzione

// Token rates
let TOKENS_PER_SOL = 102000;
let TOKENS_PER_USDT = 1000;

// Blockchain connection
const connection = new Connection(
  clusterApiUrl(NETWORK),
  "confirmed"
);

// USDT Token Account su Solana (Token USDT su mainnet Solana SPL)
const USDT_TOKEN_ADDRESS = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"; // Indirizzo token USDT SPL su mainnet

// Importazione del Token Program per le transazioni USDT
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

let wallet = null;
let adminWallet = null;

// Initialize connection and fetch admin wallet and rates
async function initConnection() {
  try {
    // Fetch admin wallet
    const walletResponse = await fetch('/api/admin-wallet');
    const walletData = await walletResponse.json();
    adminWallet = walletData.adminWallet;
    console.log("Admin wallet set:", adminWallet);
    
    // Fetch token rates
    const ratesResponse = await fetch('/api/token-rates');
    const ratesData = await ratesResponse.json();
    TOKENS_PER_SOL = ratesData.tokensPerSol;
    TOKENS_PER_USDT = ratesData.tokensPerUSDT;
    console.log("Token rates loaded:", ratesData);
  } catch (error) {
    console.error("Failed to fetch config:", error);
    // Fallback to defaults
    adminWallet = "6sY8rEL3yhC4XC14NJUxwujMemz5d2QNSh6VRBymQ6eS";
  }
}

// Fetch live SOL price from backend
async function getSolPrice() {
  try {
    const res = await fetch('/api/sol-price');
    const data = await res.json();
    return data.price || 150;
  } catch (e) {
    console.error('Price fetch error', e);
    return 150;
  }
}

// Minimum purchase in USD
const MIN_PURCHASE_USD = 40;

// Helper to abbreviate address
function shortAddr(addr) {
  return addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : '';
}

// Override connectWallet to show short address
async function connectWallet() {
  try {
    if (window.solana && window.solana.isPhantom) {
      const resp = await window.solana.connect();
      wallet = window.solana;
      
      // Update UI
      const walletAddrElem = document.getElementById("walletAddress");
      if (walletAddrElem) walletAddrElem.textContent = resp.publicKey.toString();
      
      // Update nav button text
      const navBtn = document.getElementById('navConnectWalletBtn');
      if (navBtn) navBtn.textContent = shortAddr(resp.publicKey.toString());
      
      const connectBtns = document.querySelectorAll('.connect-wallet');
      connectBtns.forEach(btn => {
        btn.textContent = shortAddr(resp.publicKey.toString());
        btn.classList.add('bg-green-500');
      });
      return resp.publicKey.toString();
    } else {
      alert("Installa Phantom Wallet o altro wallet compatibile Solana!");
      return null;
    }
  } catch (error) {
    console.error("Wallet connection error:", error);
    alert("Errore durante la connessione del wallet.");
    return null;
  }
}

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
    
    // Arrotonda l'importo a 6 decimali (standard USDT)
    const amount = Math.floor(usdtAmount * 1000000);
    
    // 1. Trova l'account token USDT dell'utente
    const userTokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet.publicKey,
      { mint: new PublicKey(USDT_TOKEN_ADDRESS) }
    );
    
    if (userTokenAccounts.value.length === 0) {
      alert("Non hai un account token USDT. Crea un account token USDT prima di procedere.");
      return null;
    }
    
    const userTokenAccount = userTokenAccounts.value[0].pubkey;
    
    // 2. Trova o crea l'account token dell'admin
    const adminPublicKey = new PublicKey(adminWallet);
    let adminTokenAccount;
    
    try {
      const adminTokenAccounts = await connection.getParsedTokenAccountsByOwner(
        adminPublicKey,
        { mint: new PublicKey(USDT_TOKEN_ADDRESS) }
      );
      
      if (adminTokenAccounts.value.length > 0) {
        adminTokenAccount = adminTokenAccounts.value[0].pubkey;
      } else {
        alert("L'amministratore non ha un account token USDT configurato.");
        return null;
      }
    } catch (error) {
      alert("Errore nel trovare l'account token dell'amministratore: " + error.message);
      return null;
    }
    
    // 3. Crea l'istruzione di trasferimento SPL Token
    const transferInstruction = splToken.createTransferInstruction(
      userTokenAccount,
      adminTokenAccount,
      wallet.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    );
    
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
    const response = await fetch('/api/record-purchase', {
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
    const response = await fetch('/api/record-usdt-purchase', {
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
    // Fetch the latest rates
    const ratesResponse = await fetch('/api/token-rates');
    const ratesData = await ratesResponse.json();
    
    return {
      tokensPerSol: ratesData.tokensPerSol,
      tokensPerUSDT: ratesData.tokensPerUSDT,
      earlyBirdBonus: 0.15, // 15% bonus
      earlyBirdThreshold: 50000000, // First 50M tokens get bonus
      totalSold: 0
    };
  } catch (error) {
    console.error("Failed to fetch presale info:", error);
    // Fallback to defaults
    return {
      tokensPerSol: TOKENS_PER_SOL,
      tokensPerUSDT: TOKENS_PER_USDT,
      earlyBirdBonus: 0.15,
      earlyBirdThreshold: 50000000,
      totalSold: 0
    };
  }
}

// Calculate token amount from SOL
function calculateTokenAmount(solAmount, presaleInfo) {
  const baseAmount = solAmount * presaleInfo.tokensPerSol;
  let bonus = 0;
  
  // Check if eligible for early bird bonus
  if (presaleInfo.totalSold < presaleInfo.earlyBirdThreshold) {
    bonus = baseAmount * presaleInfo.earlyBirdBonus;
  }
  
  const totalAmount = baseAmount + bonus;
  
  // Update UI if needed
  const bonusAmountElement = document.getElementById('bonusAmount');
  const totalAmountElement = document.getElementById('totalAmount');
  
  if (bonusAmountElement) {
    bonusAmountElement.textContent = Math.floor(bonus).toLocaleString() + ' $FROGGLE';
  }
  
  if (totalAmountElement) {
    totalAmountElement.textContent = Math.floor(totalAmount).toLocaleString() + ' $FROGGLE';
  }
  
  return Math.floor(totalAmount);
}

// Calculate token amount from USDT
function calculateTokenAmountFromUSDT(usdtAmount, presaleInfo) {
  const baseAmount = usdtAmount * presaleInfo.tokensPerUSDT;
  let bonus = 0;
  
  // Check if eligible for early bird bonus
  if (presaleInfo.totalSold < presaleInfo.earlyBirdThreshold) {
    bonus = baseAmount * presaleInfo.earlyBirdBonus;
  }
  
  return Math.floor(baseAmount + bonus);
}

// Modify buyTokens validation
async function buyTokensWithValidation(solAmount) {
  const solPrice = await getSolPrice();
  const usdValue = solAmount * solPrice;
  if (usdValue < MIN_PURCHASE_USD) {
    alert(`Minimum purchase is ${MIN_PURCHASE_USD} USD (≈${(MIN_PURCHASE_USD/solPrice).toFixed(3)} SOL)`);
    return null;
  }
  const lamports = solAmount * LAMPORTS_PER_SOL;
  return buyTokens(lamports);
}

// Validate USDT amount against minimum purchase
async function buyWithUSDTValidation(usdtAmount) {
  if (usdtAmount < MIN_PURCHASE_USD) {
    alert(`Minimum purchase is ${MIN_PURCHASE_USD} USDT`);
    return null;
  }
  return buyWithUSDT(usdtAmount);
}

// Fetch activity for wallet
async function fetchActivity() {
  if (!wallet?.publicKey) return;
  const res = await fetch(`/api/purchases?wallet=${wallet.publicKey.toString()}`);
  const data = await res.json();
  if (!data.success) return;
  const container = document.getElementById('walletTransactions');
  if (!container) return;
  if (data.purchases.length === 0) return; // keep default
  container.innerHTML = data.purchases.map(p=>`<div class='w-full text-left border-b py-2 text-sm'>${new Date(p.timestamp).toLocaleDateString()} - ${p.currency} ${p.currency==='SOL'?p.amountSOL.toFixed(3):p.amountUSDT} → ${p.froggleAmount.toLocaleString()} $FROGGLE</div>`).join('') + `<div class='font-bold mt-2'>Total: ${data.totalFroggle.toLocaleString()} $FROGGLE</div>`;
}

// Export functions for global access
window.connectWallet = connectWallet;
window.buyTokens = buyTokens;
window.buyWithUSDT = buyWithUSDT;
window.buyWithUSDTValidation = buyWithUSDTValidation;
window.initConnection = initConnection;
window.updatePresaleInfo = updatePresaleInfo;
window.calculateTokenAmount = calculateTokenAmount;
window.calculateTokenAmountFromUSDT = calculateTokenAmountFromUSDT;
window.getSolPrice = getSolPrice;
window.fetchActivity = fetchActivity;
  