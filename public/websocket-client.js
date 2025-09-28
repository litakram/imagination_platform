// WebSocket Synchronization Client
class WebSocketSync {
  constructor(clientType) {
    this.clientType = clientType; // 'controller' or 'display'
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.isConnected = false;
    
    this.init();
  }

  init() {
    this.connect();
  }

  connect() {
    try {
      // Connect to WebSocket server
      this.ws = new WebSocket('ws://localhost:3000');
      
      this.ws.onopen = () => {
        console.log(`WebSocket connected as ${this.clientType}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Register client type with server
        this.send({
          type: `register_${this.clientType}`
        });

        // Trigger connection established event
        this.onConnectionEstablished();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
        this.isConnected = false;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.attemptReconnect();
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected. Message not sent:', data);
    }
  }

  handleMessage(data) {
    console.log('Received WebSocket message:', data);

    switch (data.type) {
      case 'connection_established':
        console.log('Connection confirmed:', data.message);
        break;

      case 'sync_action':
        // Handle synchronized actions from controller
        if (this.clientType === 'display') {
          this.handleSyncAction(data.action, data.payload);
        }
        break;

      case 'sync_page_change':
        // Handle page changes
        if (this.clientType === 'display') {
          this.handlePageChange(data.page, data.payload);
        }
        break;

      case 'sync_app_start':
        // Handle application start
        if (this.clientType === 'display') {
          this.handleAppStart(data.payload);
        }
        break;

      default:
        console.log('Unknown message type received:', data.type);
    }
  }

  // Controller methods - send actions to displays
  sendControllerAction(action, payload = {}) {
    console.log('sendControllerAction called:', { clientType: this.clientType, action, payload });
    if (this.clientType === 'controller') {
      const message = {
        type: 'controller_action',
        action: action,
        payload: payload
      };
      console.log('Sending controller action:', message);
      this.send(message);
    } else {
      console.log('Not a controller, cannot send controller action');
    }
  }

  sendPageChange(page, payload = {}) {
    if (this.clientType === 'controller') {
      this.send({
        type: 'page_change',
        page: page,
        payload: payload
      });
    }
  }

  sendAppStart(payload = {}) {
    if (this.clientType === 'controller') {
      this.send({
        type: 'app_start',
        payload: payload
      });
    }
  }

  // Display methods - handle incoming sync messages
  handleSyncAction(action, payload) {
    console.log(`Display handling sync action: ${action}`, payload);
    
    switch (action) {
      case 'button_click':
        this.simulateButtonClick(payload.buttonId);
        break;
      case 'page_transition':
        this.handlePageTransition(payload.targetPage);
        break;
      case 'animation_trigger':
        this.triggerAnimation(payload.animationType);
        break;
      case 'return_to_home':
        this.handleReturnToHome(payload);
        break;
      default:
        console.log('Unknown sync action:', action);
    }
  }

  handlePageChange(page, payload) {
    console.log(`Display handling page change to: ${page}`, payload);
    
    switch (page) {
      case 'app':
        this.navigateToApp();
        break;
      case 'home':
        this.navigateToHome();
        break;
      default:
        console.log('Unknown page change:', page);
    }
  }

  handleAppStart(payload) {
    console.log('Display handling app start', payload);
    this.startApplication();
  }

  // Utility methods for display screen
  simulateButtonClick(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      // Add visual feedback for the synchronized action
      button.classList.add('sync-active');
      setTimeout(() => {
        button.classList.remove('sync-active');
      }, 500);
    }
  }

  handlePageTransition(targetPage) {
    // Implement page transition logic for display screen
    console.log(`Transitioning display to page: ${targetPage}`);
  }

  triggerAnimation(animationType) {
    // Trigger specific animations on display screen
    console.log(`Triggering animation: ${animationType}`);
  }

  navigateToApp() {
    // Navigate to appropriate page based on client type
    if (this.clientType === 'controller') {
      window.location.href = 'app.html';
    } else {
      window.location.href = 'awaiting.html';
    }
  }

  navigateToHome() {
    // Navigate to home page on display screen
    window.location.href = 'index.html';
  }

  startApplication() {
    // Start the application with different navigation for each screen type
    if (this.clientType === 'controller') {
      window.location.href = 'app.html';
    } else {
      window.location.href = 'awaiting.html';
    }
  }

  handleReturnToHome(payload) {
    console.log('WebSocket handleReturnToHome called for clientType:', this.clientType, 'payload:', payload);
    
    // Navigate display screen back to index.html
    if (this.clientType === 'display') {
      console.log('Display client navigating to index.html');
      window.location.href = 'index.html';
    } else {
      console.log('Not a display client, no navigation');
    }
  }

  // Event handlers that can be overridden
  onConnectionEstablished() {
    // Override this method to handle connection establishment
    console.log(`${this.clientType} connection established`);
  }

  // Clean up
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Initialize WebSocket based on page
let wsSync = null;

// Auto-detect client type based on current page
function initializeWebSocket() {
  const currentPage = window.location.pathname;
  let clientType;

  if (currentPage.includes('index2') || currentPage.includes('controller')) {
    clientType = 'controller';
  } else {
    clientType = 'display';
  }

  wsSync = new WebSocketSync(clientType);
  
  // Store globally for access from other scripts
  window.wsSync = wsSync;
  
  console.log(`Initialized WebSocket as ${clientType}`);
}