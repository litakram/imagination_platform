// WebSocket Synchronization Client
class WebSocketSync {
  constructor(clientType) {
    this.clientType = clientType; // 'controller' or 'display'
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.isConnected = false;
    this.manualDisconnect = false;
    
    // Detect environment
    this.isLocal = this.detectLocalEnvironment();
    
    this.init();
  }
  
  // Detect if running locally or deployed
  detectLocalEnvironment() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname.endsWith('.local');
  }

  init() {
    this.connect();
    this.setupFallbackListeners();
  }
  
  // Setup fallback communication listeners
  setupFallbackListeners() {
    // Listen for localStorage changes (fallback method 1)
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('wsync_') && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          // Only process messages from other client types
          if (data.clientType !== this.clientType) {
            console.log('Received fallback message via localStorage:', data);
            this.handleMessage(data);
          }
        } catch (error) {
          console.error('Error parsing fallback localStorage message:', error);
        }
      }
    });
    
    // Listen for BroadcastChannel messages (fallback method 2)
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('wsync-fallback');
      channel.onmessage = (event) => {
        const data = event.data;
        // Only process messages from other client types
        if (data.clientType !== this.clientType) {
          console.log('Received fallback message via BroadcastChannel:', data);
          this.handleMessage(data);
        }
      };
      
      // Store reference for cleanup
      this.fallbackChannel = channel;
    }
  }

  connect() {
    try {
      // Dynamically determine WebSocket URL based on current location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; // This includes both hostname and port
      const wsUrl = `${protocol}//${host}`;
      
      console.log(`Environment: ${this.isLocal ? 'Local' : 'Deployed'}`);
      console.log(`Attempting to connect to WebSocket at: ${wsUrl}`);
      
      // Connect to WebSocket server
      this.ws = new WebSocket(wsUrl);
      
      // Set connection timeout for deployed environments
      const connectionTimeout = this.isLocal ? 5000 : 10000;
      const timeoutId = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.warn('WebSocket connection timeout, closing...');
          this.ws.close();
        }
      }, connectionTimeout);
      
      this.ws.onopen = () => {
        clearTimeout(timeoutId); // Clear connection timeout
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
        
        // Only attempt reconnect if not manually disconnected
        if (!this.manualDisconnect) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.error('Failed to connect to:', wsUrl);
        this.isConnected = false;
        
        // Log helpful debugging information
        console.log('Current location:', window.location.href);
        console.log('Attempting connection to:', wsUrl);
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
      return true;
    } else {
      console.warn('WebSocket not connected. Using fallback communication:', data);
      
      // Fallback: Use localStorage and BroadcastChannel for local synchronization
      this.sendViaFallback(data);
      return false;
    }
  }
  
  // Fallback communication method
  sendViaFallback(data) {
    try {
      // Method 1: localStorage (works across all tabs/windows on same domain)
      const fallbackKey = `wsync_${this.clientType}_${Date.now()}`;
      localStorage.setItem(fallbackKey, JSON.stringify({
        ...data,
        timestamp: Date.now(),
        clientType: this.clientType
      }));
      
      // Clean up old fallback messages
      setTimeout(() => {
        localStorage.removeItem(fallbackKey);
      }, 5000);
      
      // Method 2: BroadcastChannel (modern browsers)
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('wsync-fallback');
        channel.postMessage({
          ...data,
          timestamp: Date.now(),
          clientType: this.clientType
        });
        channel.close();
      }
      
      console.log('Fallback message sent via localStorage and BroadcastChannel');
    } catch (error) {
      console.error('Fallback communication failed:', error);
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
    this.manualDisconnect = true;
    if (this.ws) {
      this.ws.close();
    }
    
    // Clean up fallback channel
    if (this.fallbackChannel) {
      this.fallbackChannel.close();
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