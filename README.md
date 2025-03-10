# Vigilant React Native SDK

This is the React Native SDK for Vigilant (https://vigilant.run).

## Installation

```bash
npm install vigilant-react-native
```

## Logging Usage (Standard)
```typescript
import { 
  initLogger, 
  logInfo, 
  logWarn, 
  logError, 
  logDebug,
  shutdownLogger
} from 'vigilant-react-native'

initLogger({
  name: 'service-name',
  token: 'tk_1234567890',
})

// Basic logging
logInfo('User logged in')
logWarn('Rate limit approaching')
logError('Database connection failed')
logDebug('Processing request')

// Logging with additional attributes
logInfo('Order processed', { orderId: '123', amount: 99.99 })

// Application shutdown
await shutdownLogger()
```

## Logging Usage (Autocapture)
```typescript
import { 
  initLogger, 
  enableLogAutocapture,
  disableLogAutocapture,
  shutdownLogger
} from 'vigilant-react-native'
// Create the logger
initLogger({
  name: 'service-name',
  endpoint: 'log.vigilant.run:4317',
  token: 'tk_1234567890',
})

// Enable autocapture
enableLogAutocapture()

// Log some messages to the console
console.log('Hello, world!')
console.error('Error!')

// Application shutdown
await shutdownLogger()
```