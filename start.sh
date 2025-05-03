#!/bin/bash

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed. Please install Node.js to continue."
    exit 1
fi

# Install backend dependencies if not already installed
echo "Setting up backend..."
cd backend
npm install

# Start the backend server
echo "Starting FROGGLE Presale backend..."
npm start 