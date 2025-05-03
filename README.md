# FROGGLE 3.0 - Memecoin Presale Platform

FROGGLE is a Solana-based memecoin with a presale platform that allows users to purchase tokens using SOL.

## Overview

This project consists of:

1. **Frontend**: A pre-built, styled website for the presale
2. **Backend**: A simple Node.js server that handles transactions and records purchases

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- A Solana wallet (like Phantom)

### Configuration

1. Edit the following files to configure your presale:

   - `backend/server.js`: Replace `YOUR_SOLANA_WALLET_ADDRESS` with your actual Solana wallet address where you want to receive funds
   - Optionally adjust `TOKENS_PER_SOL` in `backend/server.js` to change the exchange rate

### Installation

1. Clone this repository
2. Run the following commands:

```bash
# Make the start script executable
chmod +x start.sh

# Start the application
./start.sh
```

3. Access the application at http://localhost:3000

## How It Works

1. Users visit your website and connect their Solana wallet
2. They enter an amount of SOL to send
3. When they click "BUY FROGGLE":
   - The SOL is sent directly to your wallet
   - Their wallet address and purchase amount are recorded in `backend/purchases/purchases.json`
   - This record can be used later to distribute FROGGLE tokens

## User Experience

1. **Connect Wallet**: User connects their Solana wallet (Phantom, etc.)
2. **Choose Amount**: User selects how much SOL they want to spend
3. **Complete Purchase**: User clicks "BUY FROGGLE" and approves the transaction in their wallet
4. **Confirmation**: User receives confirmation that their purchase was recorded

## Files Structure

- `FRONTEND/`: Contains all frontend files
  - `index.html`: Main website
  - `js/wallet-integration.js`: Handles wallet connection and transactions
- `backend/`: Contains the backend server
  - `server.js`: Express server handling API requests
  - `purchases/`: Directory where purchase records are stored

## Deployment

For production deployment:

1. Host the backend on a VPS or cloud service (AWS, DigitalOcean, etc.)
2. Make sure to set up proper SSL/TLS for secure connections
3. Consider using a process manager like PM2 to keep the server running

## Security Considerations

This is a simple implementation. For production use, consider:

- Adding proper authentication
- Using a database instead of file storage
- Implementing more robust error handling
- Adding rate limiting to prevent abuse

## License

This project is for personal use only. 