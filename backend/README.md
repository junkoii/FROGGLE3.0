# FROGGLE Presale Backend

This is a simple backend for the FROGGLE memecoin presale. It allows buyers to connect their Solana wallet, send SOL or USDT, and records the transaction details in a JSON file.

## Features

- Connects to Solana wallets (via the frontend)
- Accepts SOL payments
- Records transaction data (wallet address and amount to receive in FROGGLE)
- Serves the frontend static files

## Setup

1. Install dependencies:
   ```
   cd backend
   npm install
   ```

2. Edit the `server.js` file and replace `YOUR_SOLANA_WALLET_ADDRESS` with your actual Solana wallet address where you want to receive funds.

3. Adjust the `TOKENS_PER_SOL` value in `server.js` if you want to change the exchange rate.

## Running the Server

Start the server with:

```
npm start
```

For development with auto-reload:

```
npm run dev
```

The server will run on port 3000 by default (http://localhost:3000).

## How It Works

1. Users connect their Solana wallet through the frontend
2. They enter the amount of SOL they want to send
3. When they click "BUY FROGGLE", the transaction is sent to your wallet address
4. The transaction details are recorded in `purchases/purchases.json`

## Transaction Records

All purchases are recorded in `purchases/purchases.json` with the following information:
- Wallet address of the sender
- Amount of SOL sent
- Amount of FROGGLE tokens to be received
- Transaction ID (Solana signature)
- Timestamp

You can use this record to manually distribute tokens at a later date.

## Security Notes

This is a simple implementation focused on collecting funds. For production use, consider:
- Adding proper authentication
- Using a database instead of file storage
- Implementing more robust error handling
- Adding rate limiting to prevent abuse 