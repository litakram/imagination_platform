const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Create HTTP server for serving static files
const server = http.createServer((req, res) => {
  // Simple static file serving
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  
  // Get file extension for content type
  const ext = path.extname(filePath);
  const contentType = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
  }[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients with their types
const clients = {
  controllers: [], // index2.html clients (21" screens)
  displays: []     // index.html clients (vertical display screens)
};

wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);

      switch (data.type) {
        case 'register_controller':
          // Register as controller (index2.html)
          clients.controllers.push(ws);
          ws.clientType = 'controller';
          console.log(`Controller registered. Total controllers: ${clients.controllers.length}`);
          break;

        case 'register_display':
          // Register as display (index.html)
          clients.displays.push(ws);
          ws.clientType = 'display';
          console.log(`Display registered. Total displays: ${clients.displays.length}`);
          break;

        case 'controller_action':
          // Forward controller actions to all displays
          console.log('Broadcasting controller action to displays:', data.action);
          broadcastToDisplays({
            type: 'sync_action',
            action: data.action,
            payload: data.payload || {}
          });
          break;

        case 'page_change':
          // Handle page navigation
          console.log('Broadcasting page change to displays:', data.page);
          broadcastToDisplays({
            type: 'sync_page_change',
            page: data.page,
            payload: data.payload || {}
          });
          break;

        case 'app_start':
          // Handle application start
          console.log('Broadcasting app start to displays');
          broadcastToDisplays({
            type: 'sync_app_start',
            payload: data.payload || {}
          });
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    
    // Remove from appropriate client list
    if (ws.clientType === 'controller') {
      clients.controllers = clients.controllers.filter(client => client !== ws);
      console.log(`Controller disconnected. Remaining controllers: ${clients.controllers.length}`);
    } else if (ws.clientType === 'display') {
      clients.displays = clients.displays.filter(client => client !== ws);
      console.log(`Display disconnected. Remaining displays: ${clients.displays.length}`);
    }
  });

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'WebSocket connection successful'
  }));
});

// Function to broadcast messages to all display clients
function broadcastToDisplays(message) {
  clients.displays.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Function to broadcast messages to all controller clients
function broadcastToControllers(message) {
  clients.controllers.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('WebSocket server ready for connections');
  console.log('- Controllers (index2.html): Interactive control screens');
  console.log('- Displays (index.html): Synchronized display screens');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});