
# FROGGLE Token Metadata Upload Instructions

## Step 1: Upload to IPFS
1. Go to https://pinata.cloud and create a free account
2. Click "Upload" → "File"
3. Upload the file: froggle-metadata.json
4. Copy the IPFS hash (CID)

## Step 2: Create Metadata Account
Use one of these methods:

### Method A: Solana CLI (if you have it installed)
```bash
spl-token create-metadata \
  4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle \
  "FROGGLE" \
  "FROGGLE" \
  "ipfs://YOUR_IPFS_HASH_HERE"
```

### Method B: Metaplex Sugar CLI
```bash
sugar create-metadata \
  --mint 4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle \
  --uri "ipfs://YOUR_IPFS_HASH_HERE"
```

### Method C: Use a service like:
- Metaplex Studio: https://studio.metaplex.com
- Solana Token Creator: https://solana-token-creator.com
- Strata Protocol: https://app.strataprotocol.com

## Step 3: Verify
After creating metadata, check on:
- Solscan: https://solscan.io/token/4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle
- Solana Explorer: https://explorer.solana.com/address/4b48dmTkBbGCrM9KXJSBMcZZAhPAqjTxJDjSk8Froggle

The token should now show "FROGGLE" name and logo!
