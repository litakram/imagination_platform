# Imagination Platform WebSocket Synchronization

This setup allows you to synchronize two screens:
1. **Controller Screen** (index2.html) - 21" interactive screen
2. **Display Screen** (index.html) - Large vertical display screen for audience viewing

## Setup Instructions

### 1. Install Dependencies
```cmd
npm install
```

### 2. Start the WebSocket Server
```cmd
npm run websocket
```
This starts the WebSocket server on `http://localhost:3000`

### 3. Access the Screens

**Controller Screen (21" Interactive):**
- Open: `http://localhost:3000/index2.html`
- This is the interactive screen where users control the experience

**Display Screen (Vertical Display):**
- Open: `http://localhost:3000/index.html`  
- This is the passive display screen that shows synchronized content

## How It Works

### Screen Roles

1. **Controller (index2.html)**:
   - Interactive 21" screen
   - Users can click buttons and control the application
   - Navigates to `app.html` when start button clicked
   - Sends WebSocket messages to synchronize displays
   - Shows "Controller Mode" indicator

2. **Display (index.html)**:
   - Vertical display screen for audience viewing (PASSIVE - NO INTERACTION)
   - Receives synchronized actions from controller
   - Automatically navigates to `awaiting.html` when controller starts
   - Shows "Display Mode" indicator and "DISPLAY SCREEN - Controlled Remotely" text
   - No click handlers or interactive elements

### Synchronization Features

- **Button Clicks**: When controller clicks start button, display screen navigates simultaneously
- **Page Navigation**: Both screens navigate together (index → app pages)
- **Visual Feedback**: Display screen shows sync indicators when actions occur
- **Connection Status**: Both screens show connection status indicators
- **Automatic Reconnection**: If connection drops, clients automatically attempt to reconnect

### WebSocket Message Types

1. **Registration**: Clients register as 'controller' or 'display'
2. **Controller Actions**: Button clicks, interactions sent to displays
3. **Page Changes**: Navigation events synchronized across screens
4. **App Start**: Application launch synchronized

## Usage Workflow

1. Start the WebSocket server
2. Open controller screen on 21" device: `http://localhost:3000/index2.html`
3. Open display screen on vertical display: `http://localhost:3000/index.html`
4. Both screens will show connection indicators
5. **User clicks start button on controller (index2.html):**
   - Controller navigates to `app.html` (normal drawing app)
   - Display automatically navigates to `awaiting.html` (shows "user is drawing" with animations)
6. Display screen has NO interactive elements - purely for viewing
7. All navigation is controlled from the 21" controller screen

## Technical Details

### Files Created/Modified:
- `websocket-server.js` - WebSocket server handling client connections
- `public/websocket-client.js` - Client-side WebSocket management
- `index.html` - Updated with display screen synchronization
- `index2.html` - Updated with controller synchronization  
- `app.html` - Updated with app-level synchronization

### Connection Indicators:
- **Green**: Connected and synchronized
- **Orange**: Controller mode active
- **Blue**: App synchronization active

### Error Handling:
- Automatic reconnection on connection loss
- Maximum 5 reconnection attempts
- Graceful degradation if WebSocket unavailable

## Troubleshooting

1. **Connection Issues**: Ensure WebSocket server is running on port 3000
2. **Browser Console**: Check for WebSocket errors in developer tools
3. **Firewall**: Ensure port 3000 is accessible
4. **Multiple Controllers**: Multiple controller screens can connect simultaneously

## Development Notes

- WebSocket server uses Node.js `ws` library
- Client auto-detects role based on current page URL
- Synchronized actions can be extended for drawing events
- Connection status visible in browser console logs