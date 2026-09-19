# Rainbow Wallet Integration Guide

## What is Rainbow Wallet?

Rainbow Wallet is a popular Ethereum wallet supporting Ethereum, Polygon, Base, Arbitrum, ERC-20 tokens, NFTs, and Web3 dApps.

Website: https://rainbow.me

## Installation Steps

### Browser Extension:
1. Visit https://rainbow.me
2. Click Download and choose your browser
3. Add to Chrome/Firefox/Brave/Edge
4. Create new wallet
5. **IMPORTANT:** Write down your 12-word seed phrase on paper
6. Set strong password

### Mobile App:
- iOS: App Store -> Search Rainbow Wallet
- Android: Google Play -> Search Rainbow Wallet

## Token Contract Setup

### Step 1: Deploy Your Token

Use Remix IDE (https://remix.ethereum.org):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract JEVToken {
    string public name = Jev Brain Token;
    string public symbol = JEV;
    uint256 public totalSupply = 1000000000 * 10**18;
    mapping(address => uint256) public balanceOf;
    event Transfer(address indexed from, address indexed to, uint256 value);
    
    constructor() {
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }
    
    function transfer(address _to, uint256 _value) public returns (bool success) {
        require(balanceOf[msg.sender] >= _value, Insufficient balance);
        balanceOf[msg.sender] -= _value;
        balanceOf[_to] += _value;
        emit Transfer(msg.sender, _to, _value);
        return true;
    }
}
```

### Step 2: Update Configuration

Edit `.env` file:

```bash
TOKEN_CONTRACT_ADDRESS=0xYourActualContractAddress
TOKEN_CHAIN=ethereum
MINIMUM_TOKENS_REQUIRED=1000000
```

## Configuration

### Environment Variables:

```env
TOKEN_CONTRACT_ADDRESS=0xYourTokenContractAddressHere
TOKEN_CHAIN=ethereum
MINIMUM_TOKENS_REQUIRED=1000000
SUPPORTED_WALLETS=rainbow,metamask
WALLET_GATING_ENABLED=true
TOKEN_CHECK_ENABLED=true
```

## How It Works

1. User visits website
2. Wallet gate overlay appears
3. User clicks Connect Rainbow Wallet
4. Rainbow Wallet popup opens
5. User approves connection
6. Backend verifies token balance
7. If holding tokens -> Access granted
8. If not holding -> Gate remains visible

## Testing

```bash
# Start server
npm start

# Open browser
http://localhost:3333

# Test wallet connection:
1. Click Connect Rainbow Wallet
2. Approve in Rainbow Wallet
3. Backend verifies tokens
4. Access granted if holding 1M+ tokens
```

## Troubleshooting

### Rainbow Wallet not detected:
- Ensure extension is installed
- Refresh page after installation
- Check browser compatibility

### Token verification fails:
- Check contract address in .env
- Verify token deployed
- Ensure user holds tokens
- Check correct network selected

### Access denied with tokens:
- Verify on Etherscan
- Check MINIMUM_TOKENS_REQUIRED
- Ensure tier calculation correct

## OpenRouter Models: 16 Total

Frontier: Claude 3.5 Sonnet, GPT-4o, o1 Preview, Claude 3 Opus, Gemini 1.5 Pro
Pro: Llama 3.1 70B, DeepSeek V3, DeepSeek Coder 33B, Claude 3.5 Haiku, GPT-4o Mini, Qwen 2.5 72B
Basic: Llama 3.1 8B (Free), Llama 3.1 8B Instant, Gemini 1.5 Flash, Mistral 7B (Free), Qwen 2.5 7B
