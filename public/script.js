

// Front‑end logic for the Imagination Platform Remake
//
// This script manages the drawing canvas, side toolbar, colour picker,
// predictions from the server, and final image generation.  It relies on
// vanilla JavaScript and communicates with the Express backend via
// fetch() requests.

document.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('startScreen');
  const app = document.getElementById('app');
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas.getContext('2d');
  const sidePanel = document.getElementById('sidePanel');
  // const togglePanelBtn = document.getElementById('togglePanel');
  const eraserBtn = document.getElementById('eraserBtn');
  const sizeSlider = document.getElementById('sizeSlider');
  const currentColorDisplay = document.getElementById('currentColor');
  const colorMenu = document.getElementById('colorMenu');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const styleCarousel = document.getElementById('styleCarousel');
  const generateBtn = document.getElementById('generateBtn');
  const loader = document.getElementById('loader');
  const resultContainer = document.getElementById('resultContainer');
  const resultImage = document.getElementById('resultImage');
  const backBtn = document.getElementById('backBtn');
  const topPrompt = document.getElementById('topPrompt');
  const promptText = document.getElementById('promptText');
  const yesBtn = document.getElementById('yesBtn');
  const noBtn = document.getElementById('noBtn');
  const progressBar = topPrompt.querySelector('.progress');
  
  // Shape tool buttons
  const squareBtn = document.getElementById('squareBtn');
  const circleBtn = document.getElementById('circleBtn');
  const triangleBtn = document.getElementById('triangleBtn');
  const lineBtn = document.getElementById('lineBtn');

  // State variables
  let isDrawing = false;
  let isErasing = false;
  let brushSize = parseInt(sizeSlider.value, 10);
  let currentColor = '#000000';
  let paths = []; // stack of drawn strokes for undo
  let redoPaths = []; // stack of undone strokes for redo
  let currentPath = [];
  let drawingChanged = false;
  let predictionIntervalId;
  let promptTimeoutId;
  let lastGuess = '';
  let lastAnswer = '';
  let selectedStyle = '';
  
  // Shape state variables
  let shapes = []; // Array to store all shapes on canvas
  let activeShape = null; // Currently selected shape for interaction
  let isCreatingShape = false; // Flag for shape creation mode
  let selectedShapeType = null; // Current shape type (square, circle, triangle, line)
  let isResizingShape = false; // Flag for resizing mode
  let isMovingShape = false; // Flag for moving mode
  let isRotatingShape = false; // Flag for rotating mode
  let lastClickTime = 0; // For double-click detection
  let startPos = { x: 0, y: 0 }; // For resizing and moving operations
  let startAngle = 0; // For rotation operations
  let resizeCorner = null; // Which corner is being used for resizing
  
  // Helper function to determine the correct French article
  function getArticle(word) {
    // Default to indefinite masculine "un"
    let article = "un";
    
    // Common feminine words for basic detection
    const feminineWords = [
      'maison', 'voiture', 'table', 'chaise', 'fleur', 'montagne', 'rivière',
      'plage', 'pomme', 'banane', 'orange', 'fraise', 'tomate', 'carotte',
      'personne', 'femme', 'fille', 'tête', 'main', 'jambe', 'bouche', 'dent',
      'porte', 'fenêtre', 'école', 'ville', 'rue', 'plante', 'étoile', 'lune'
    ];
    
    // Common plural words
    const pluralWords = [
      'montagnes', 'arbres', 'fleurs', 'personnes', 'animaux', 'oiseaux', 
      'poissons', 'chats', 'chiens', 'maisons', 'voitures', 'étoiles', 
      'enfants', 'femmes', 'hommes', 'fruits', 'légumes'
    ];
    
    // Words that start with vowel sounds need "l'"
    const vowelStart = /^[aeiouàâéèêëîïôùûüÿæœ]/i;
    
    // Basic rule checking - very simplified
    const lowercaseWord = word.toLowerCase();
    
    if (pluralWords.some(plural => lowercaseWord.includes(plural))) {
      article = "des";
    } else if (feminineWords.some(fem => lowercaseWord.includes(fem))) {
      article = vowelStart.test(word) ? "l'" : "une";
    } else {
      article = vowelStart.test(word) ? "l'" : "un";
    }
    
    return article;
  }

  // Style options with personalized prompts
  const styles = [
    'Aquarelle',
    'Illustration',
    'Pop Art',
    'Croquis',
    'Dessin Animé 3D',
    'Peinture à l\'huile',
  ];
  
  // Personalized prompts for each style
  const stylePrompts = {
    'Aquarelle': 'Transformer ce croquis en une peinture aquarelle délicate, avec des lavis de couleur doux, des dégradés subtils et un effet de pigments naturels sur papier texturé. Mettre en valeur la transparence, les fondus et des coups de pinceau fluides.',
    'Illustration': 'Améliorer ce croquis en une illustration nette et détaillée, avec des lignes précises, des couleurs vives et des ombrages équilibrés. Style professionnel et raffiné, adapté à l’éditorial ou au concept art.',
    'Pop Art': 'Convertir ce croquis en une œuvre Pop Art audacieuse, avec des couleurs saturées, des contours épais, des motifs tramés et un contraste fort. Donner un style iconique et ludique, inspiré de la bande dessinée.',
    'Croquis': 'Transformer ce croquis en une image qui garde l’apparence d’un prédessin ou d’un avant-dessin. Conserver uniquement les traits rapides, les lignes expressives et les hachures, sans ajouter de réalisme ni de volume 3D. Éviter les couleurs fortes : utiliser seulement quelques nuances discrètes, comme si l’image était à l’état d’esquisse. Employer des textures de crayon ou de fusain avec un style carnet de dessin, qui met en valeur le geste et la construction de la forme, plutôt que l’aspect global ou réaliste de l’image.',
    'Dessin Animé 3D': 'Transformer ce croquis en un rendu cartoon 3D coloré, avec des ombrages doux, une lumière réaliste et des personnages stylisés. Mettre l’accent sur l’expression, les proportions ludiques et un rendu proche d’un film d’animation.',
    'Peinture à l\'huile': 'Convertir ce croquis en une peinture à l’huile riche et texturée, avec des coups de pinceau visibles, des couleurs profondes et des effets de lumière réalistes. Donner une esthétique classique et artistique.'
  };

  /**
   * Initialise the drawing canvas to fill the window and set up event handlers.
   */
  function initCanvas() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events for mobile
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); // Empêche le défilement sur les appareils mobiles
      startDrawing(e.touches[0]);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      handleMouseMove(e.touches[0]);
    }, { passive: false });
    window.addEventListener('touchend', stopDrawing);
    
    // Initialize button states
    undoBtn.classList.remove('active');
    redoBtn.classList.remove('active');
    
    // Initialize shape tools
    initShapeTools();
  }

  /**
   * Adjust the canvas size to match the viewport and redraw existing paths.
   */
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    redraw();
  }

  /**
   * Dessine un point circulaire à la position spécifiée
   * @param {number} x - Coordonnée X du point
   * @param {number} y - Coordonnée Y du point
   * @param {string} color - Couleur du point
   * @param {number} size - Taille du point (diamètre)
   */
  function drawDot(x, y, color, size) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  
  /**
   * Begin a new stroke or shape interaction on mousedown/touchstart.
   */
  function startDrawing(e) {
    const { x, y } = getCanvasPos(e);
    
    // Clear redo history when starting a new stroke
    if (redoPaths.length > 0) {
      redoPaths = [];
      // Update redo button visual state
      redoBtn.classList.remove('active');
    }
    
    // Handle shape creation first
    if (isCreatingShape && selectedShapeType) {
      // Create a new shape
      createShape(selectedShapeType, x, y);
      drawingChanged = true;
      return; // Don't proceed with regular drawing
    }
    
    // Check if we're clicking on a rotation handle
    for (let i = shapes.length - 1; i >= 0; i--) {
      const shape = shapes[i];
      if (shape.finalized) continue;
      
      if (shape.isOnRotationHandle(x, y)) {
        // Start rotation mode
        isRotatingShape = true;
        activeShape = shape;
        
        // Calculate the initial angle between center and mouse position
        const centerX = shape.centerX;
        const centerY = shape.centerY;
        startAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
        
        // Store the initial rotation
        startAngle = shape.rotation;
        
        redraw();
        return;
      }
    }
    
    // First check if we're clicking on a resize handle
    const resizeHandleInfo = findResizeHandleAt(x, y);
    if (resizeHandleInfo) {
      // Prepare for shape resizing
      isResizingShape = true;
      activeShape = resizeHandleInfo.shape;
      resizeCorner = resizeHandleInfo.cornerIndex;
      return; // Don't proceed with regular drawing
    }
    
    // Check for shape body interaction
    const clickedShape = findShapeAt(x, y);
    
    if (clickedShape) {
      // Only allow interaction if the shape hasn't been finalized
      if (!clickedShape.finalized) {
        // Prepare for movement
        isMovingShape = true;
        activeShape = clickedShape;
        startPos.x = x;
        startPos.y = y;
        redraw(); // To show resize handles
        return; // Don't proceed with regular drawing
      }
      // If shape is finalized, treat it like the background - just draw on it
    } else {
      // Clicked on empty canvas area
      // If there's an active shape, finalize it
      if (activeShape) {
        activeShape.finalized = true; // Mark the shape as finalized
        activeShape = null;
        redraw(); // Redraw to remove resize handles
      }
      
      // Only proceed with drawing if not in shape creation mode
      if (!isCreatingShape) {
        // Regular drawing behavior
        isDrawing = true;
        currentPath = [];
        drawingChanged = true;
        
        // Draw a point immediately for instant visual feedback
        drawDot(x, y, isErasing ? '#ffffff' : currentColor, brushSize);
        
        draw(e);
      }
    }
  }

  /**
   * Handle mouse movement for cursor feedback and drawing
   */
  function handleMouseMove(e) {
    const { x, y } = getCanvasPos(e);
    
    // Handle rotation if we're in rotating mode
    if (isRotatingShape && activeShape) {
      // Calculate angle between center of shape, original position, and current position
      const centerX = activeShape.centerX;
      const centerY = activeShape.centerY;
      
      const currentAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
      const angleDiff = currentAngle - startAngle;
      
      // Update shape rotation (5° increments for more controlled rotation)
      const rotationStep = 5; // Rotate in 5-degree increments
      const snappedAngleDiff = Math.round(angleDiff / rotationStep) * rotationStep;
      
      // Set the rotation directly rather than incrementally to avoid accumulation errors
      activeShape.rotation = (startAngle + snappedAngleDiff) % 360;
      if (activeShape.rotation < 0) {
        activeShape.rotation += 360;
      }
      
      redraw();
      return;
    }
    
    // Check if we're hovering over a resize handle and change cursor
    if (!isDrawing && !isResizingShape && !isMovingShape && !isRotatingShape) {
      let foundInteraction = false;
      
      // Check if we're over a rotation handle
      for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        if (shape.finalized) continue;
        
        if (shape.isOnRotationHandle(x, y)) {
          foundInteraction = true;
          canvas.style.cursor = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'><path fill=\'white\' d=\'M12,5V1L7,6l5,5V7c3.31,0,6,2.69,6,6s-2.69,6-6,6s-6-2.69-6-6H4c0,4.42,3.58,8,8,8s8-3.58,8-8S16.42,5,12,5z\'/></svg>") 12 12, auto';
          break;
        }
      }
      
      // If not over rotation handle, check other handles
      if (!foundInteraction) {
        // Check if the mouse is over any resize handle
        const resizeHandleInfo = findResizeHandleAt(x, y);
        if (resizeHandleInfo) {
          const { shape, cornerIndex } = resizeHandleInfo;
          foundInteraction = true;
          
          // Set appropriate cursor based on shape type and corner
          if (shape.type === 'line') {
            canvas.style.cursor = 'pointer';
          } else if (shape.type === 'circle') {
            // For circle, use different cursors based on which handle
            switch(cornerIndex) {
              case 0: // Left handle
              case 1: // Right handle
                canvas.style.cursor = 'ew-resize';
                break;
              case 2: // Top handle
              case 3: // Bottom handle
                canvas.style.cursor = 'ns-resize';
                break;
            }
          } else {
            // For square and triangle, use diagonal resize cursors for corners
            switch(cornerIndex) {
              case 0: // Top-left or top
                canvas.style.cursor = shape.type === 'triangle' ? 'n-resize' : 'nwse-resize';
                break;
              case 1: // Top-right or bottom-left for triangle
                canvas.style.cursor = shape.type === 'triangle' ? 'sw-resize' : 'nesw-resize';
                break;
              case 2: // Bottom-right or bottom-right for triangle
                canvas.style.cursor = shape.type === 'triangle' ? 'se-resize' : 'nwse-resize';
                break;
              case 3: // Bottom-left (for square)
                canvas.style.cursor = 'nesw-resize';
                break;
            }
          }
        } else {
          // Check if over a shape body
          const clickedShape = findShapeAt(x, y);
          if (clickedShape && !clickedShape.finalized) {
            foundInteraction = true;
            canvas.style.cursor = 'move';
          }
        }
      }
      
      // Reset cursor if not over any shape handle
      if (!foundInteraction) {
        if (isCreatingShape) {
          canvas.style.cursor = 'crosshair';
        } else if (isErasing) {
          canvas.style.cursor = 'cell'; // Crosshair with dot to indicate eraser
        } else {
          canvas.style.cursor = 'crosshair';
        }
      }
    }
    
    // Call the original draw function to handle actual drawing/resizing/moving
    draw(e);
  }
  
  /**
   * Draw a line segment or handle shape resizing/moving during mouse/touch move.
   */
  function draw(e) {
    const { x, y } = getCanvasPos(e);
    
    // Handle shape resizing
    if (isResizingShape && activeShape && resizeCorner !== null) {
      activeShape.resize(resizeCorner, x, y);
      redraw();
      drawingChanged = true;
      return;
    }
    
    // Handle shape moving
    if (isMovingShape && activeShape) {
      const dx = x - startPos.x;
      const dy = y - startPos.y;
      activeShape.move(dx, dy);
      startPos.x = x;
      startPos.y = y;
      redraw();
      drawingChanged = true;
      return;
    }
    
    // Regular drawing behavior
    if (!isDrawing) return;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isErasing ? '#ffffff' : currentColor;
    ctx.lineWidth = brushSize;
    
    if (currentPath.length === 0) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      currentPath.push({ x, y });
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
      currentPath.push({ x, y });
    }
  }

  /**
   * Finish the current stroke or shape interaction on mouseup/touchend.
   */
  function stopDrawing() {
    // Handle rotation operation
    if (isRotatingShape) {
      // Add to undo stack if shape was rotated
      if (activeShape) {
        paths.push({
          isShape: true,
          shapeId: activeShape.id,
          action: 'rotate',
          previousRotation: startAngle,
          newRotation: activeShape.rotation
        });
        undoBtn.classList.add('active');
      }
      
      // Reset the rotation flag but keep the shape active
      isRotatingShape = false;
      drawingChanged = true;
      return;
    }
    
    // Handle shape operations first
    if (isResizingShape || isMovingShape) {
      // Add to undo stack if shape was resized or moved
      if (activeShape) {
        paths.push({
          isShape: true,
          shapeId: activeShape.id,
          action: 'modify'
        });
        undoBtn.classList.add('active');
      }
      
      // Reset the shape interaction flags but keep the shape active
      // so the user can continue editing it until they click elsewhere
      isResizingShape = false;
      isMovingShape = false;
      resizeCorner = null;
      drawingChanged = true;
      
      // Don't set activeShape to null here - keep it selected
      // It will be finalized when the user clicks elsewhere
      
      return;
    }
    
    // Regular drawing behavior
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentPath.length > 0) {
      paths.push({
        points: currentPath.slice(),
        color: isErasing ? '#ffffff' : currentColor,
        size: brushSize,
      });
      // Update undo button state when adding a new path
      undoBtn.classList.add('active');
    }
    currentPath = [];
  }

  /**
   * Convert a mouse/touch event into canvas coordinates.
   */
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  /**
   * Redraw the entire canvas based on the stored paths.  Used after undo
   * operations and canvas resizes.
   */
  function redraw() {
    // Fill background white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Redraw each stored path
    for (const path of paths) {
      // Check if it's a shape operation
      if (path.isShape) {
        // We don't draw shapes here, as they're stored in the shapes array
        // and drawn separately below
        continue;
      }
      // Check if it's an imported sketch
      else if (path.isImportedSketch && path.imageData) {
        // Create a temporary image to draw the imported sketch
        const img = new Image();
        img.onload = function() {
          // Calculate aspect ratio to fit image properly
          const scale = Math.min(
            canvas.width / img.width,
            canvas.height / img.height
          ) * 0.8; // Scale to 80% of available space
          
          const newWidth = img.width * scale;
          const newHeight = img.height * scale;
          
          // Center the image
          const x = (canvas.width - newWidth) / 2;
          const y = (canvas.height - newHeight) / 2;
          
          // Draw the image
          ctx.drawImage(img, x, y, newWidth, newHeight);
        };
        // Set the source to start loading
        img.src = path.imageData;
      } 
      // Check if it's a single point (simple click)
      else if (path.points && path.points.length === 1) {
        // Draw a circular point
        const point = path.points[0];
        drawDot(point.x, point.y, path.color, path.size);
      }
      // Otherwise it's a regular line
      else if (path.points && path.points.length > 1) {
        // Draw a line for normal strokes
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.size;
        path.points.forEach((pt, index) => {
          if (index === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }
    }
    
    // Draw all shapes
    for (const shape of shapes) {
      shape.draw(ctx);
    }
  }



  /**
   * Set the active colour and update the display.
   */
  function setColour(col) {
    currentColor = col;
    currentColorDisplay.style.background = col;
    isErasing = false;
    eraserBtn.classList.remove('active');
    eraserBtn.classList.remove('active-eraser');
  }

  /**
   * Initialize the advanced color picker
   */
  function initColourMenu() {
    // Clear any existing content
    colorMenu.innerHTML = '';
    
    // Initialize the advanced color picker
    const advancedColorPicker = new ColorPicker({
      container: colorMenu,
      initialColor: currentColor,
      onChange: (color) => {
        setColour(color);
      }
    });
    
    // Store the color picker instance for later use
    window.advancedColorPicker = advancedColorPicker;
    
    // Set up the current color display click handler
    currentColorDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      advancedColorPicker.toggle();
    });
    
    // Close the color picker when clicking outside
    document.addEventListener('click', (e) => {
      if (advancedColorPicker.isVisible() && 
          !colorMenu.contains(e.target) && 
          e.target !== currentColorDisplay) {
        advancedColorPicker.hide();
      }
    });
    
    // Set initial color display
    currentColorDisplay.style.background = currentColor;
  }
  
  /**
   * Shape related functions
   */
  
  // Shape class definition
  class Shape {
    constructor(type, x, y, width, height, color) {
      this.type = type; // 'square', 'circle', 'triangle', or 'line'
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.color = color;
      this.borderColor = color;
      this.fillColor = 'white'; // Default white fill
      this.id = Date.now() + Math.random().toString(36).substr(2, 9);
      this.finalized = false; // Flag to track if shape has been finalized
      this.rotation = 0; // Rotation in degrees (0-360)
      this.centerX = x + width / 2; // Center X for rotation
      this.centerY = y + height / 2; // Center Y for rotation
    }
    
    // Check if a point is inside this shape
    contains(px, py) {
      // For square (actually rectangle)
      if (this.type === 'square') {
        return px >= this.x && px <= this.x + this.width &&
               py >= this.y && py <= this.y + this.height;
      }
      
      // For circle
      else if (this.type === 'circle') {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const rx = this.width / 2;
        const ry = this.height / 2;
        
        const dx = (px - centerX) / rx;
        const dy = (py - centerY) / ry;
        return dx * dx + dy * dy <= 1;
      }
      
      // For triangle (assuming equilateral triangle pointing up)
      else if (this.type === 'triangle') {
        const x1 = this.x + this.width / 2; // Top point
        const y1 = this.y;
        
        const x2 = this.x; // Bottom left
        const y2 = this.y + this.height;
        
        const x3 = this.x + this.width; // Bottom right
        const y3 = this.y + this.height;
        
        // Check if point is inside triangle using barycentric coordinates
        const A = 0.5 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3);
        const sign = A < 0 ? -1 : 1;
        const s = (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py) * sign;
        const t = (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py) * sign;
        
        return s > 0 && t > 0 && (s + t) < 2 * A * sign;
      }
      
      // For line - check if point is close to the line segment
      else if (this.type === 'line') {
        // Start and end points of the line
        const x1 = this.x;
        const y1 = this.y;
        const x2 = this.x + this.width;
        const y2 = this.y + this.height;
        
        // Calculate distance from point to line
        const lineLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        if (lineLength === 0) return false;  // If it's not a line but a point
        
        // Use the formula for distance from point to line segment
        const distance = Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1) / lineLength;
        
        // Check if the point projection lies on the segment
        const dot = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (lineLength * lineLength);
        
        // If the point is close enough to the line and projection lies on the segment
        return distance <= 10 && dot >= 0 && dot <= 1;  // 10 pixels tolerance for selection
      }
      
      return false;
    }
    
    // Check if a point is near a corner of this shape
    getResizeCorner(px, py, tolerance = 20) { // Increased from 10 to 20 pixels for easier interaction
      const corners = this.getCorners();
      
      for (let i = 0; i < corners.length; i++) {
        const corner = corners[i];
        const distance = Math.sqrt(Math.pow(corner.x - px, 2) + Math.pow(corner.y - py, 2));
        
        if (distance <= tolerance) {
          return i; // Return the index of the corner
        }
      }
      
      return null; // No corner found
    }
    
    // Method signature kept for compatibility with existing code but functionality removed
    getFlipEdge(px, py, tolerance = 20) {
      // Flip functionality has been disabled
      return null; // Always return null as we no longer support flipping
    }
    
    // Get all corners of this shape for resizing
    getCorners() {
      if (this.type === 'square') {
        return [
          { x: this.x, y: this.y }, // Top-left
          { x: this.x + this.width, y: this.y }, // Top-right
          { x: this.x + this.width, y: this.y + this.height }, // Bottom-right
          { x: this.x, y: this.y + this.height } // Bottom-left
        ];
      }
      else if (this.type === 'circle') {
        // For a circle, we'll use cardinal points as handles
        return [
          { x: this.x, y: this.y + this.height/2 }, // Left
          { x: this.x + this.width, y: this.y + this.height/2 }, // Right
          { x: this.x + this.width/2, y: this.y }, // Top
          { x: this.x + this.width/2, y: this.y + this.height } // Bottom
        ];
      }
      else if (this.type === 'triangle') {
        return [
          { x: this.x + this.width/2, y: this.y }, // Top
          { x: this.x, y: this.y + this.height }, // Bottom-left
          { x: this.x + this.width, y: this.y + this.height } // Bottom-right
        ];
      }
      else if (this.type === 'line') {
        return [
          { x: this.x, y: this.y }, // Start point
          { x: this.x + this.width, y: this.y + this.height } // End point
        ];
      }
      return [];
    }
    
    // Draw the shape on the canvas
    draw(context) {
      context.save();
      context.strokeStyle = this.borderColor;
      context.fillStyle = this.fillColor;
      context.lineWidth = 2;
      
      // Update center point for rotation
      this.centerX = this.x + this.width / 2;
      this.centerY = this.y + this.height / 2;
      
      // Apply rotation if any
      if (this.rotation !== 0) {
        // Translate to center of shape, rotate, then translate back
        context.translate(this.centerX, this.centerY);
        context.rotate(this.rotation * Math.PI / 180);
        context.translate(-this.centerX, -this.centerY);
      }
      
      if (this.type === 'square') {
        context.beginPath();
        context.rect(this.x, this.y, this.width, this.height);
        context.fill();
        context.stroke();
      }
      else if (this.type === 'circle') {
        context.beginPath();
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const radiusX = this.width / 2;
        const radiusY = this.height / 2;
        
        context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
      else if (this.type === 'triangle') {
        context.beginPath();
        // Draw an equilateral triangle pointing upward
        context.moveTo(this.x + this.width / 2, this.y); // Top point
        context.lineTo(this.x, this.y + this.height); // Bottom left
        context.lineTo(this.x + this.width, this.y + this.height); // Bottom right
        context.closePath();
        context.fill();
        context.stroke();
      }
      else if (this.type === 'line') {
        context.beginPath();
        // Draw a straight line from start to end points
        context.moveTo(this.x, this.y); // Start point
        context.lineTo(this.x + this.width, this.y + this.height); // End point
        
        // Lines are stroked but not filled
        context.lineWidth = 3; // Slightly thicker than default
        context.lineCap = 'round'; // Use round caps for better appearance
        context.stroke();
      }
      
      // If this is the active shape, draw resize handles and rotation indicator
      if (this === activeShape) {
        // Reset rotation for drawing handles in the correct positions
        context.restore();
        context.save();
        
        const corners = this.getCorners();
        for (const corner of corners) {
          // Draw larger, more visible resize handles
          // First draw a white background circle for contrast
          context.fillStyle = 'white';
          context.beginPath();
          context.arc(corner.x, corner.y, 8, 0, Math.PI * 2);
          context.fill();
          
          // Then draw a slightly smaller colored circle on top
          context.fillStyle = this.borderColor;
          context.beginPath();
          context.arc(corner.x, corner.y, 6, 0, Math.PI * 2);
          context.fill();
          
          // Add a border for better definition
          context.strokeStyle = 'white';
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(corner.x, corner.y, 6, 0, Math.PI * 2);
          context.stroke();
        }
        
        // Draw rotation indicator - a small circle above the shape
        const rotationHandleDistance = Math.max(this.width, this.height) / 2 + 25;
        const rotationHandleX = this.centerX;
        const rotationHandleY = this.centerY - rotationHandleDistance;
        
        // Draw a line from center to rotation handle
        context.beginPath();
        context.setLineDash([3, 3]); // Dashed line
        context.moveTo(this.centerX, this.centerY);
        context.lineTo(rotationHandleX, rotationHandleY);
        context.strokeStyle = this.borderColor;
        context.lineWidth = 1.5;
        context.stroke();
        context.setLineDash([]); // Reset dash
        
        // Draw rotation handle
        context.fillStyle = '#4CAF50'; // Green color for rotation
        context.beginPath();
        context.arc(rotationHandleX, rotationHandleY, 8, 0, Math.PI * 2);
        context.fill();
        
        // Add a border for better definition
        context.strokeStyle = 'white';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(rotationHandleX, rotationHandleY, 8, 0, Math.PI * 2);
        context.stroke();
        
        // Draw rotation icon inside the handle (simple curved arrow)
        context.beginPath();
        context.arc(rotationHandleX, rotationHandleY, 4, 0, 1.5 * Math.PI);
        context.strokeStyle = 'white';
        context.lineWidth = 1.5;
        context.stroke();
        
        // Draw arrowhead
        context.beginPath();
        context.moveTo(rotationHandleX, rotationHandleY - 4);
        context.lineTo(rotationHandleX - 2, rotationHandleY - 6);
        context.lineTo(rotationHandleX - 3, rotationHandleY - 2);
        context.fillStyle = 'white';
        context.fill();
      }
      
      context.restore();
    }
    
    // Resize the shape based on a drag operation
    resize(cornerIndex, newX, newY) {
      if (this.type === 'square') {
        switch (cornerIndex) {
          case 0: // Top-left
            const width = this.x + this.width - newX;
            const height = this.y + this.height - newY;
            if (width > 20 && height > 20) {
              this.width = width;
              this.height = height;
              this.x = newX;
              this.y = newY;
            }
            break;
          case 1: // Top-right
            const heightTR = this.y + this.height - newY;
            if (newX - this.x > 20 && heightTR > 20) {
              this.width = newX - this.x;
              this.height = heightTR;
              this.y = newY;
            }
            break;
          case 2: // Bottom-right
            if (newX - this.x > 20 && newY - this.y > 20) {
              this.width = newX - this.x;
              this.height = newY - this.y;
            }
            break;
          case 3: // Bottom-left
            const widthBL = this.x + this.width - newX;
            if (widthBL > 20 && newY - this.y > 20) {
              this.width = widthBL;
              this.x = newX;
              this.height = newY - this.y;
            }
            break;
        }
      }
      else if (this.type === 'circle') {
        // Resize the circle based on cardinal points
        switch (cornerIndex) {
          case 0: // Left handle
            const widthL = this.x + this.width - newX;
            if (widthL > 20) {
              this.width = widthL;
              this.x = newX;
            }
            break;
          case 1: // Right handle
            if (newX - this.x > 20) {
              this.width = newX - this.x;
            }
            break;
          case 2: // Top handle
            const heightT = this.y + this.height - newY;
            if (heightT > 20) {
              this.height = heightT;
              this.y = newY;
            }
            break;
          case 3: // Bottom handle
            if (newY - this.y > 20) {
              this.height = newY - this.y;
            }
            break;
        }
      }
      else if (this.type === 'triangle') {
        // Resize triangle based on its three points
        switch (cornerIndex) {
          case 0: // Top point - affects width and height proportionally
            if (newY < this.y + this.height - 20) {
              const ratio = this.width / this.height;
              const newHeight = this.y + this.height - newY;
              this.y = newY;
              this.height = newHeight;
              this.width = newHeight * ratio;
              this.x = this.x + (this.width - (newHeight * ratio)) / 2;
            }
            break;
          case 1: // Bottom-left point
            if (this.x + this.width - newX > 20) {
              this.width = this.x + this.width - newX;
              this.x = newX;
            }
            break;
          case 2: // Bottom-right point
            if (newX - this.x > 20) {
              this.width = newX - this.x;
            }
            break;
        }
      }
      else if (this.type === 'line') {
        // For a line, the width and height represent the vector from start to end
        switch (cornerIndex) {
          case 0: // Start point
            // Calculate new width and height based on the end point (which stays fixed)
            const endX = this.x + this.width;
            const endY = this.y + this.height;
            // Update line dimensions
            this.width = endX - newX;
            this.height = endY - newY;
            // Update starting position
            this.x = newX;
            this.y = newY;
            break;
          case 1: // End point
            // Start point stays fixed, just update width and height
            this.width = newX - this.x;
            this.height = newY - this.y;
            break;
        }
      }
    }
    
    // Move the shape
    move(dx, dy) {
      this.x += dx;
      this.y += dy;
    }
    
    // Check if a point is near the rotation handle
    isOnRotationHandle(px, py) {
      // Update center point
      this.centerX = this.x + this.width / 2;
      this.centerY = this.y + this.height / 2;
      
      const rotationHandleDistance = Math.max(this.width, this.height) / 2 + 25;
      const rotationHandleX = this.centerX;
      const rotationHandleY = this.centerY - rotationHandleDistance;
      
      // Calculate distance from point to rotation handle
      const distance = Math.sqrt(Math.pow(px - rotationHandleX, 2) + Math.pow(py - rotationHandleY, 2));
      
      // Return true if within 20px of the handle (for easier interaction)
      return distance <= 20;
    }
    
    // Rotate the shape by the given angle in degrees
    rotate(angle) {
      this.rotation = (this.rotation + angle) % 360;
      if (this.rotation < 0) {
        this.rotation += 360;
      }
    }
    
    // Flip the shape horizontally
    flipHorizontal() {
      if (this.type === 'square' || this.type === 'circle') {
        // For square and circle, we flip around the center
        // No visible change needed for these symmetrical shapes
        // But we'll trigger the action for consistency with undo/redo
        return true;
      }
      else if (this.type === 'triangle') {
        // For triangle, we need to adjust the position to maintain the same footprint
        // Since our triangle has its point at the top, flipping horizontally means
        // moving it by its width to keep it in the same visual space
        this.x = this.x + this.width - this.width; // Stays the same visually
        return true;
      }
      else if (this.type === 'line') {
        // For line, swap the start and end x coordinates
        const endX = this.x + this.width;
        this.width = -this.width;
        this.x = endX;
        return true;
      }
      return false;
    }
    
    // Flip the shape vertically
    flipVertical() {
      if (this.type === 'square' || this.type === 'circle') {
        // For square and circle, we flip around the center
        // No visible change needed for these symmetrical shapes
        // But we'll trigger the action for consistency with undo/redo
        return true;
      }
      else if (this.type === 'triangle') {
        // For triangle, invert it by adjusting the y position
        // Our triangle points up by default, so flipping makes it point down
        const oldHeight = this.height;
        // Adjust y position to maintain same bounding box
        this.y = this.y + this.height;
        this.height = -this.height;
        return true;
      }
      else if (this.type === 'line') {
        // For line, swap the start and end y coordinates
        const endY = this.y + this.height;
        this.height = -this.height;
        this.y = endY;
        return true;
      }
      return false;
    }
  }
  
  // Function to handle creating a new shape
  function createShape(type, x, y) {
    // Default size for new shapes
    const defaultSize = 100;
    
    // Create a new shape with current color
    const newShape = new Shape(
      type,
      x - defaultSize / 2,
      y - defaultSize / 2,
      defaultSize,
      defaultSize,
      currentColor
    );
    
    // Add to shapes array
    shapes.push(newShape);
    
    // Make it the active shape and NOT finalized yet
    // so the user can resize/move it immediately
    activeShape = newShape;
    
    // Add to undo stack
    paths.push({
      isShape: true,
      shapeId: newShape.id,
      action: 'add'
    });
    
    // Update undo button state
    undoBtn.classList.add('active');
    
    // Mark as drawing changed for prediction
    drawingChanged = true;
    
    // Automatically deactivate the shape tool after placing a shape
    isCreatingShape = false;
    selectedShapeType = null;
    
    // Remove active class from all shape buttons
    squareBtn.classList.remove('active');
    squareBtn.classList.remove('active-eraser');
    circleBtn.classList.remove('active');
    circleBtn.classList.remove('active-eraser');
    triangleBtn.classList.remove('active');
    triangleBtn.classList.remove('active-eraser');
    lineBtn.classList.remove('active');
    lineBtn.classList.remove('active-eraser');
    
    // Redraw to show the new shape with its resize handles
    redraw();
    
    return newShape;
  }
  
  // Function to find a shape at a specific position
  function findShapeAt(x, y) {
    // Check in reverse order to get the topmost shape
    // Only return shapes that haven't been finalized
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (!shapes[i].finalized && shapes[i].contains(x, y)) {
        return shapes[i];
      }
    }
    return null;
  }
  
  // Helper function to check if a point is over any resize handle
  function findResizeHandleAt(x, y) {
    // Check all shapes in reverse order (top to bottom)
    for (let i = shapes.length - 1; i >= 0; i--) {
      const shape = shapes[i];
      if (shape.finalized) continue;
      
      // Check if we're over a resize handle
      const cornerIndex = shape.getResizeCorner(x, y);
      if (cornerIndex !== null) {
        return { shape, cornerIndex };
      }
    }
    return null;
  }
  
  // Initialize shape tool buttons
  function initShapeTools() {
    // Set up shape buttons
    squareBtn.addEventListener('click', () => {
      // If already selected, deselect
      if (selectedShapeType === 'square') {
        selectedShapeType = null;
        squareBtn.classList.remove('active');
        squareBtn.classList.remove('active-eraser');
        isCreatingShape = false;
      } else {
        // Deactivate other shape buttons
        circleBtn.classList.remove('active');
        circleBtn.classList.remove('active-eraser');
        triangleBtn.classList.remove('active');
        triangleBtn.classList.remove('active-eraser');
        lineBtn.classList.remove('active');
        lineBtn.classList.remove('active-eraser');
        // Activate square button
        squareBtn.classList.add('active');
        squareBtn.classList.add('active-eraser');
        selectedShapeType = 'square';
        isCreatingShape = true;
        // Exit other modes
        isErasing = false;
        eraserBtn.classList.remove('active-eraser');
      }
      
      // We don't deselect the active shape when switching tools
      // This allows returning to edit shapes after drawing
    });
    
    circleBtn.addEventListener('click', () => {
      if (selectedShapeType === 'circle') {
        selectedShapeType = null;
        circleBtn.classList.remove('active');
        circleBtn.classList.remove('active-eraser');
        isCreatingShape = false;
      } else {
        squareBtn.classList.remove('active');
        squareBtn.classList.remove('active-eraser');
        triangleBtn.classList.remove('active');
        triangleBtn.classList.remove('active-eraser');
        lineBtn.classList.remove('active');
        lineBtn.classList.remove('active-eraser');
        circleBtn.classList.add('active');
        circleBtn.classList.add('active-eraser');
        selectedShapeType = 'circle';
        isCreatingShape = true;
        // Exit other modes
        isErasing = false;
        eraserBtn.classList.remove('active-eraser');
      }
      
      // We don't deselect the active shape when switching tools
    });
    
    triangleBtn.addEventListener('click', () => {
      if (selectedShapeType === 'triangle') {
        selectedShapeType = null;
        triangleBtn.classList.remove('active');
        triangleBtn.classList.remove('active-eraser');
        isCreatingShape = false;
      } else {
        squareBtn.classList.remove('active');
        squareBtn.classList.remove('active-eraser');
        circleBtn.classList.remove('active');
        circleBtn.classList.remove('active-eraser');
        lineBtn.classList.remove('active');
        lineBtn.classList.remove('active-eraser');
        triangleBtn.classList.add('active');
        triangleBtn.classList.add('active-eraser');
        selectedShapeType = 'triangle';
        isCreatingShape = true;
        // Exit other modes
        isErasing = false;
        eraserBtn.classList.remove('active-eraser');
      }
      
      // We don't deselect the active shape when switching tools
    });
    
    lineBtn.addEventListener('click', () => {
      if (selectedShapeType === 'line') {
        selectedShapeType = null;
        lineBtn.classList.remove('active');
        lineBtn.classList.remove('active-eraser');
        isCreatingShape = false;
      } else {
        // Deactivate other shape buttons
        squareBtn.classList.remove('active');
        squareBtn.classList.remove('active-eraser');
        circleBtn.classList.remove('active');
        circleBtn.classList.remove('active-eraser');
        triangleBtn.classList.remove('active');
        triangleBtn.classList.remove('active-eraser');
        
        // Activate line button with both classes for consistency
        lineBtn.classList.add('active');
        lineBtn.classList.add('active-eraser');
        
        selectedShapeType = 'line';
        isCreatingShape = true;
        
        // Exit other modes
        isErasing = false;
        eraserBtn.classList.remove('active-eraser');
      }
      
      // We don't deselect the active shape when switching tools
    });
  }

  /**
   * Populate the style carousel with buttons and set up selection handling.
   */
  function initStyleCarousel() {
    // Clear existing content
    styleCarousel.innerHTML = '';
    
    // Create carousel container without navigation
    const carouselWrapper = document.createElement('div');
    carouselWrapper.className = 'carousel-wrapper';
    
    // Create the carousel container
    const carouselContainer = document.createElement('div');
    carouselContainer.className = 'carousel';
    
    // Background images for each style using the local cat images in the images folder
    const styleImages = {
      'Aquarelle': 'url("/images/aquarelle cat.jpg")',
      'Illustration': 'url("/images/illustration cat.jpg")',
      'Pop Art': 'url("/images/pop art cat.jpg")',
      'Croquis': 'url("/images/croquis cat.jpg")',
      'Dessin Animé 3D': 'url("/images/3D cat.jpg")',
      'Peinture à l\'huile': 'url("/images/oil cat.png")',
    };
    
    // Add mouse drag scrolling functionality
    let isDown = false;
    let startX;
    let scrollLeft;
    
    carouselContainer.addEventListener('mousedown', (e) => {
      isDown = true;
      carouselContainer.style.cursor = 'grabbing';
      startX = e.pageX - carouselContainer.offsetLeft;
      scrollLeft = carouselContainer.scrollLeft;
      e.preventDefault();
    });
    
    carouselContainer.addEventListener('mouseleave', () => {
      isDown = false;
      carouselContainer.style.cursor = 'grab';
    });
    
    carouselContainer.addEventListener('mouseup', () => {
      isDown = false;
      carouselContainer.style.cursor = 'grab';
    });
    
    carouselContainer.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - carouselContainer.offsetLeft;
      const walk = (x - startX) * 2; // Scroll speed
      carouselContainer.scrollLeft = scrollLeft - walk;
    });
    
    // Add touch scrolling for mobile
    let touchStartX;
    let touchScrollLeft;
    
    carouselContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].pageX - carouselContainer.offsetLeft;
      touchScrollLeft = carouselContainer.scrollLeft;
    });
    
    carouselContainer.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) return; // Ignore multi-touch
      const x = e.touches[0].pageX - carouselContainer.offsetLeft;
      const walk = (touchStartX - x) * 1.5; // Adjust for touch sensitivity
      carouselContainer.scrollLeft = touchScrollLeft + walk;
      e.preventDefault(); // Prevent page scrolling
    }, { passive: false });
    
    styles.forEach((style) => {
      // Create a wrapper div for the style item and its label
      const wrapper = document.createElement('div');
      wrapper.className = 'style-wrapper';
      
      // Create the style item (circular button)
      const item = document.createElement('div');
      item.className = 'styleItem';
      
      // Set the background image directly from the styleImages object
      if (styleImages[style]) {
        item.style.backgroundImage = styleImages[style];
      }
      
      // Create the label that will appear below the style item
      const label = document.createElement('div');
      label.className = 'style-label';
      label.textContent = style;
      
      // Add click event to the wrapper
      wrapper.addEventListener('click', () => {
        const personalPromptInput = document.getElementById('personalPrompt');
        // Store current selected style before updating
        const previousStyle = selectedStyle;
        
        // Deactivate previous style visually
        document.querySelectorAll('.style-wrapper').forEach((el) => el.classList.remove('active'));
        document.querySelectorAll('.styleItem').forEach((el) => el.classList.remove('active'));
        
        wrapper.classList.add('active');
        item.classList.add('active');
        
        // If clicking on the same style that's already selected, toggle it off
        if (previousStyle === style && personalPromptInput) {
          // Remove the style prompt from input field if it exists
          if (previousStyle && stylePrompts[previousStyle] && 
              personalPromptInput.value.includes(stylePrompts[previousStyle])) {
            personalPromptInput.value = personalPromptInput.value.replace(stylePrompts[previousStyle], '').trim();
          }
          wrapper.classList.remove('active');
          item.classList.remove('active');
          selectedStyle = '';
          return;
        }
        
        // Set the new selected style
        selectedStyle = style;
        
        // Update the personal prompt, preserving user input and replacing only the previous style prompt
        if (personalPromptInput) {
          const currentValue = personalPromptInput.value;
          const newStylePrompt = stylePrompts[style] || `En style ${style}`;
          
          // If there was a previous style, replace its prompt text only
          if (previousStyle && stylePrompts[previousStyle] && 
              currentValue.includes(stylePrompts[previousStyle])) {
            personalPromptInput.value = currentValue.replace(
              stylePrompts[previousStyle], 
              newStylePrompt
            ).trim();
          } 
          // If the field is empty, just add the style prompt
          else if (!currentValue) {
            personalPromptInput.value = newStylePrompt;
          } 
          // Otherwise, preserve user input and add the style prompt at the beginning
          else {
            personalPromptInput.value = newStylePrompt + ' ' + currentValue;
          }
        }
      });
      
      // Add text span for style name (hidden but kept for compatibility)
      const textSpan = document.createElement('span');
      textSpan.className = 'styleText';
      textSpan.textContent = style;
      item.appendChild(textSpan);
      
      // Assemble the wrapper with the item and label
      wrapper.appendChild(item);
      wrapper.appendChild(label);
      carouselContainer.appendChild(wrapper);
    });
    
    // Assemble the carousel components (without navigation buttons)
    carouselWrapper.appendChild(carouselContainer);
    styleCarousel.appendChild(carouselWrapper);
    
    // If there's already a selected style, highlight it
    if (selectedStyle) {
      const styleWrappers = document.querySelectorAll('.style-wrapper');
      styleWrappers.forEach(wrapper => {
        const styleItem = wrapper.querySelector('.styleItem');
        const label = wrapper.querySelector('.style-label');
        
        if (label && label.textContent === selectedStyle) {
          wrapper.classList.add('active');
          styleItem.classList.add('active');
        }
      });
    }
    
    // Add animation effect to generate button when a style is selected
    document.querySelectorAll('.style-wrapper').forEach(wrapper => {
      wrapper.addEventListener('click', () => {
        const generateBtn = document.getElementById('generateBtn');
        generateBtn.classList.add('pulse-effect');
        setTimeout(() => {
          generateBtn.classList.remove('pulse-effect');
        }, 700);
      });
    });
  }

  /**
   * Start the periodic prediction timer.  Every 7 seconds it sends the current
   * sketch to the server for a guess.  If the user is actively drawing, the
   * timer waits until drawing stops.  When a guess is received, a prompt is
   * displayed with a 4‑second timeout.
   */
  function startPredictionLoop() {
    predictionIntervalId = setInterval(async () => {
      // If the user just drew something, send a prediction request
      if (drawingChanged && paths.length > 0 && !isDrawing) {
        drawingChanged = false;
        const dataUrl = canvas.toDataURL('image/png');
        try {
          const res = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl }),
          });
          const json = await res.json();
          if (json && json.guess) {
            showPrompt(json.guess);
          }
        } catch (err) {
          console.error('Prediction request failed', err);
        }
      }
    }, 7000);
  }

  /**
   * Show the top prompt with a guess and start the 4‑second timeout.  If the
   * user answers Yes/No before the timer ends, the prompt disappears.  The
   * progress bar is animated via CSS.
   */
  function showPrompt(guess) {
    lastGuess = guess;
    // Format the question in French with proper article
    let article = getArticle(guess);
    promptText.textContent = `Est-ce que c'est ${article} ${guess} ?`;
    topPrompt.classList.remove('hidden');
    // Restart progress bar animation by cloning and replacing the element
    const progressBarEl = topPrompt.querySelector('.progress');
    if (progressBarEl && progressBarEl.parentNode) {
      const newBar = progressBarEl.cloneNode(true);
      progressBarEl.parentNode.replaceChild(newBar, progressBarEl);
    }
    // Set a timeout to hide the prompt automatically after 4 seconds
    clearTimeout(promptTimeoutId);
    promptTimeoutId = setTimeout(() => {
      hidePrompt();
    }, 4000);
  }

  /**
   * Hide the top prompt and cancel any pending timeout.
   */
  function hidePrompt() {
    topPrompt.classList.add('hidden');
    clearTimeout(promptTimeoutId);
  }

  /**
   * Show the loader overlay.
   */
  function showLoader() {
    loader.classList.remove('hidden');
  }

  /**
   * Hide the loader overlay.
   */
  function hideLoader() {
    loader.classList.add('hidden');
  }

  /**
   * Show the final result overlay with the generated image.
   */
  function showResult(imageUrl) {
    console.log('Showing result with image URL:', imageUrl);
    
    // Clear any existing error messages
    const existingError = document.querySelector('.image-error');
    if (existingError) {
      existingError.remove();
    }
    
    // Cache le conteneur de résultat jusqu'à ce que l'image soit chargée
    resultContainer.classList.add('hidden');
    
    // Set up image load error handling
    resultImage.onerror = function() {
      console.error('Failed to load image from URL:', imageUrl);
      
      // Create error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'image-error';
      errorMsg.innerHTML = `
        <p>Impossible de charger l'image.</p>
        <p>URL: ${imageUrl ? imageUrl.substring(0, 30) + '...' : 'undefined'}</p>
        <button class="retry-btn">Réessayer</button>
      `;
      
      // Add retry functionality
      errorMsg.querySelector('.retry-btn').addEventListener('click', function() {
        // Add timestamp to bust cache
        resultImage.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      });
      
      // Add error message to container
      resultContainer.appendChild(errorMsg);
      
      // Masquer le loader en cas d'erreur
      hideLoader();
      
      // Afficher le conteneur même en cas d'erreur pour montrer le message
      resultContainer.classList.remove('hidden');
    };
    
    // Set up image load success handler
    resultImage.onload = function() {
      console.log('Image loaded successfully!');
      
      // Create a notice about which API was used
      const apiNotice = document.createElement('div');
      apiNotice.className = 'api-notice';
      if (imageUrl.includes('bfl.ai')) {
        apiNotice.textContent = 'Image générée avec API de secours (BFL AI)';
      } else if (imageUrl.includes('runware')) {
        apiNotice.textContent = 'Image générée avec API de secours (Runware)';
      } else {
        apiNotice.textContent = 'Image générée avec Fal AI';
      }
      resultContainer.appendChild(apiNotice);
      
      // S'assurer que le bouton de retour est prêt pour l'animation
      backBtn.style.display = 'block';
      
      // Masquer le loader uniquement quand l'image est chargée
      hideLoader();
      
      // Afficher le conteneur une fois que l'image est complètement chargée
      resultContainer.classList.remove('hidden');
    };
    
    // Set image source (le chargement va commencer)
    resultImage.src = imageUrl;
  }

  /**
   * Hide the result overlay and return to drawing.
   */
  function hideResult() {
    resultContainer.classList.add('hidden');
  }

  // Event handler: start the app when the user clicks the start screen
  startScreen.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    app.classList.remove('hidden');
    initCanvas();
    initColourMenu();
    initStyleCarousel();
    startPredictionLoop();
  });



  // Eraser button toggles erasing mode
  eraserBtn.addEventListener('click', () => {
    isErasing = !isErasing;
    if (isErasing) {
      eraserBtn.classList.add('active-eraser');
      eraserBtn.classList.remove('active');
      
      // Exit shape creation mode but keep active shape selected
      isCreatingShape = false;
      selectedShapeType = null;
      squareBtn.classList.remove('active');
      circleBtn.classList.remove('active');
      triangleBtn.classList.remove('active');
    } else {
      eraserBtn.classList.remove('active-eraser');
    }
    
    // We don't deselect the active shape when switching tools
  });

  // Brush size slider
  sizeSlider.addEventListener('input', () => {
    brushSize = parseInt(sizeSlider.value, 10);
  });

  // Colour picker toggles menu visibility on click
  currentColorDisplay.addEventListener('click', () => {
    colorMenu.classList.toggle('hidden');
  });

  // Clicking outside the colour menu closes it
  document.addEventListener('click', (e) => {
    if (!colorMenu.classList.contains('hidden') && !colorMenu.contains(e.target) && e.target !== currentColorDisplay) {
      colorMenu.classList.add('hidden');
    }
  });

  // Undo button pops the last path, saves it to redoPaths, and redraws
  undoBtn.addEventListener('click', () => {
    if (paths.length > 0) {
      const removedPath = paths.pop();
      
      // Handle shape operations
      if (removedPath.isShape) {
        if (removedPath.action === 'add') {
          // Find and remove the shape
          const shapeIndex = shapes.findIndex(s => s.id === removedPath.shapeId);
          if (shapeIndex !== -1) {
            const removedShape = shapes.splice(shapeIndex, 1)[0];
            // Save the shape data for redo
            redoPaths.push({
              isShape: true,
              action: 'add',
              shapeId: removedShape.id,
              shapeData: removedShape
            });
            
            // If the active shape was removed, deselect it
            if (activeShape && activeShape.id === removedPath.shapeId) {
              activeShape = null;
            }
          }
        }
        else if (removedPath.action === 'modify') {
          // For now, we don't have a sophisticated way to undo modifications
          // Just store the action for redo
          redoPaths.push(removedPath);
        }
        else if (removedPath.action === 'delete') {
          // Restore a deleted shape
          if (removedPath.shapeData) {
            shapes.push(removedPath.shapeData);
            redoPaths.push({
              isShape: true,
              action: 'delete',
              shapeId: removedPath.shapeData.id
            });
          }
        }
        else if (removedPath.action === 'flip') {
          // Find the shape and flip it back
          const shape = shapes.find(s => s.id === removedPath.shapeId);
          if (shape) {
            // Flip in the opposite direction to undo
            if (removedPath.direction === 'horizontal') {
              shape.flipHorizontal();
            } else {
              shape.flipVertical();
            }
            
            // Save for redo
            redoPaths.push({
              isShape: true,
              action: 'flip',
              shapeId: shape.id,
              direction: removedPath.direction
            });
          }
        }
        else if (removedPath.action === 'rotate') {
          // Find the shape and restore its previous rotation
          const shape = shapes.find(s => s.id === removedPath.shapeId);
          if (shape) {
            // Store current rotation for redo
            const currentRotation = shape.rotation;
            
            // Restore the previous rotation
            shape.rotation = removedPath.previousRotation;
            
            // Save for redo
            redoPaths.push({
              isShape: true,
              action: 'rotate',
              shapeId: shape.id,
              previousRotation: currentRotation,
              newRotation: removedPath.previousRotation
            });
          }
        }
      }
      else {
        // Standard undo for individual drawing paths
        redoPaths.push(removedPath);
      }
      
      redraw();
    } else {
      // Check if the last redo operation is a full canvas restore (after clear)
      const lastRedo = redoPaths[redoPaths.length - 1];
      if (lastRedo && lastRedo.isFullCanvas && lastRedo.paths) {
        // Restore the full canvas
        paths = [...lastRedo.paths];
        
        // Also restore shapes if they were stored
        if (lastRedo.shapes) {
          shapes = [...lastRedo.shapes];
        }
        
        redoPaths.pop();
        redraw();
      }
    }
    
    // Update the buttons' visual state
    redoBtn.classList.toggle('active', redoPaths.length > 0);
    undoBtn.classList.toggle('active', paths.length > 0);
  });
  
  // Redo button restores the last undone path and redraws
  redoBtn.addEventListener('click', () => {
    if (redoPaths.length > 0) {
      const pathToRestore = redoPaths.pop();
      
      // Handle shape operations
      if (pathToRestore.isShape) {
        if (pathToRestore.action === 'add' && pathToRestore.shapeData) {
          // Restore the shape
          shapes.push(pathToRestore.shapeData);
          paths.push({
            isShape: true,
            action: 'add',
            shapeId: pathToRestore.shapeData.id
          });
        }
        else if (pathToRestore.action === 'modify') {
          // For now, we don't have a sophisticated way to redo modifications
          // Just store the action for undo
          paths.push(pathToRestore);
        }
        else if (pathToRestore.action === 'delete') {
          // Re-delete the shape
          const shapeIndex = shapes.findIndex(s => s.id === pathToRestore.shapeId);
          if (shapeIndex !== -1) {
            const removedShape = shapes.splice(shapeIndex, 1)[0];
            paths.push({
              isShape: true,
              action: 'delete',
              shapeId: removedShape.id,
              shapeData: removedShape
            });
          }
        }
        else if (pathToRestore.action === 'flip') {
          // Find the shape and flip it again
          const shape = shapes.find(s => s.id === pathToRestore.shapeId);
          if (shape) {
            // Apply the same flip to redo
            if (pathToRestore.direction === 'horizontal') {
              shape.flipHorizontal();
            } else {
              shape.flipVertical();
            }
            
            // Save for undo
            paths.push({
              isShape: true,
              action: 'flip',
              shapeId: shape.id,
              direction: pathToRestore.direction
            });
          }
        }
        else if (pathToRestore.action === 'rotate') {
          // Find the shape and restore its new rotation
          const shape = shapes.find(s => s.id === pathToRestore.shapeId);
          if (shape) {
            // Store current rotation for undo
            const currentRotation = shape.rotation;
            
            // Apply the new rotation
            shape.rotation = pathToRestore.newRotation;
            
            // Save for undo
            paths.push({
              isShape: true,
              action: 'rotate',
              shapeId: shape.id,
              previousRotation: currentRotation,
              newRotation: pathToRestore.newRotation
            });
          }
        }
      }
      // Check if it's a full canvas restore (after clear)
      else if (pathToRestore.isFullCanvas && pathToRestore.paths) {
        paths = [...pathToRestore.paths];
        
        // Also restore shapes if they were stored
        if (pathToRestore.shapes) {
          shapes = [...pathToRestore.shapes];
        }
      } 
      else {
        // Standard redo for individual drawing paths
        paths.push(pathToRestore);
      }
      
      redraw();
      // Update the redo button's visual state
      redoBtn.classList.toggle('active', redoPaths.length > 0);
    } else {
      console.log('Nothing to redo');
    }
    // Update the undo button's visual state
    undoBtn.classList.toggle('active', paths.length > 0);
  });
  
  // Clear Canvas button clears all paths and redraws an empty canvas
  const clearCanvasBtn = document.getElementById('clearCanvasBtn');
  clearCanvasBtn.addEventListener('click', () => {
    // Save current paths and shapes for undo functionality if there are any
    if (paths.length > 0 || shapes.length > 0) {
      // Save all current paths and shapes as one undo step
      redoPaths.push({
        isFullCanvas: true,
        paths: [...paths],
        shapes: [...shapes]
      });
      // Update redo button visual state
      redoBtn.classList.add('active');
    }
    
    // Clear all paths and shapes
    paths = [];
    shapes = [];
    activeShape = null;
    
    // Redraw empty canvas - always clear the canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Update button states
    undoBtn.classList.remove('active');
    
    // Mark as changed to trigger prediction
    drawingChanged = true;
    
    // Log for debugging
    console.log('Canvas cleared');
  });

  // Yes button records positive response and hides prompt
  yesBtn.addEventListener('click', () => {
    lastAnswer = 'Yes';
    hidePrompt();
  });

  // No button records negative response and hides prompt
  noBtn.addEventListener('click', () => {
    lastAnswer = 'No';
    hidePrompt();
  });

  // Generate button sends the final drawing to the server and displays the result
  generateBtn.addEventListener('click', async () => {
    const personalPromptInput = document.getElementById('personalPrompt');
    const personalPrompt = personalPromptInput ? personalPromptInput.value.trim() : '';
    
    // Allow generation with prompt only (no drawing)
    if (paths.length === 0 && !personalPrompt) {
      alert('Veuillez dessiner quelque chose ou saisir un prompt textuel !');
      return;
    }
    
    // Cancel any pending prompt
    hidePrompt();
    
    // Cacher le bouton retour s'il était visible d'une génération précédente
    backBtn.style.display = 'none';
    
    showLoader();
    try {
      const dataUrl = canvas.toDataURL('image/png');
      // Get the personal prompt if available
      const personalPromptInput = document.getElementById('personalPrompt');
      const personalPrompt = personalPromptInput ? personalPromptInput.value.trim() : '';
      
      const payload = {
        image: dataUrl,
        style: selectedStyle,
        question: lastGuess,
        answer: lastAnswer,
        personalPrompt: personalPrompt // Add the personal prompt to the payload
      };
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      
      if (res.ok && json.image) {
        // Ne pas masquer le loader, il sera masqué quand l'image sera chargée
        showResult(json.image);
      } else {
        hideLoader(); // Masquer le loader seulement en cas d'erreur
        console.error('Generation error:', json.error);
        alert('Une erreur est survenue lors de la génération de l\'image.');
      }
    } catch (err) {
      hideLoader(); // Masquer le loader en cas d'erreur
      console.error('Generation failed', err);
      alert('Une erreur est survenue lors de la génération de l\'image.');
    }
  });

  // Back button returns to drawing mode
  backBtn.addEventListener('click', () => {
    hideResult();
  });

  // Important Sketches and GS Engine functionality
  const importantSketchesBtn = document.getElementById('importantSketchesBtn');
  const importantSketchesSection = document.getElementById('importantSketchesSection');
  const closeSketchesBtn = document.getElementById('closeSketchesBtn');
  const sketchUpload = document.getElementById('sketchUpload');
  const sketchesGallery = document.getElementById('sketchesGallery');
  
  // Store sketches in localStorage
  let savedSketches = JSON.parse(localStorage.getItem('importantSketches')) || [];
  
  // Show sketches section
  importantSketchesBtn.addEventListener('click', () => {
    importantSketchesSection.classList.remove('hidden');
    renderSavedSketches();
  });
  
  // Hide sketches section
  closeSketchesBtn.addEventListener('click', () => {
    importantSketchesSection.classList.add('hidden');
  });
  
  // Handle sketch uploads
  sketchUpload.addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = function(event) {
        const imageData = event.target.result;
        const sketchName = file.name;
        
        // Add to saved sketches
        savedSketches.push({
          id: Date.now() + Math.random().toString(36).substr(2, 9),
          name: sketchName,
          data: imageData
        });
        
        // Save to localStorage
        localStorage.setItem('importantSketches', JSON.stringify(savedSketches));
        
        // Update gallery
        renderSavedSketches();
      };
      
      reader.readAsDataURL(file);
    });
  });
  
  // Render all saved sketches in gallery
  function renderSavedSketches() {
    sketchesGallery.innerHTML = '';
    
    if (savedSketches.length === 0) {
      sketchesGallery.innerHTML = '<p>Aucun croquis importé pour le moment. Cliquez sur "Importer Croquis" pour en ajouter.</p>';
      return;
    }
    
    savedSketches.forEach(sketch => {
      const sketchItem = document.createElement('div');
      sketchItem.className = 'sketch-item';
      sketchItem.innerHTML = `
        <img src="${sketch.data}" alt="${sketch.name}" title="${sketch.name}">
        <p>${sketch.name.length > 15 ? sketch.name.substring(0, 12) + '...' : sketch.name}</p>
        <button class="delete-btn" data-id="${sketch.id}">×</button>
      `;
      
      // Add click event to load sketch into canvas
      sketchItem.querySelector('img').addEventListener('click', () => {
        loadSketchToCanvas(sketch.data);
        importantSketchesSection.classList.add('hidden');
      });
      
      // Add delete functionality
      sketchItem.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSketch(sketch.id);
      });
      
      sketchesGallery.appendChild(sketchItem);
    });
  }
  
  // Load a sketch into the canvas
  function loadSketchToCanvas(imageData) {
    const img = new Image();
    img.onload = function() {
      // Clear current canvas
      paths = [];
      
      // Clear canvas
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Calculate aspect ratio to fit image properly
      const scale = Math.min(
        canvas.width / img.width,
        canvas.height / img.height
      ) * 0.8; // Scale to 80% of available space
      
      const newWidth = img.width * scale;
      const newHeight = img.height * scale;
      
      // Center the image
      const x = (canvas.width - newWidth) / 2;
      const y = (canvas.height - newHeight) / 2;
      
      // Draw the image
      ctx.drawImage(img, x, y, newWidth, newHeight);
      
      // Add a special entry to the paths array for imported sketches
      // This will make the Clear Canvas button work with imported sketches
      paths.push({
        isImportedSketch: true,
        imageData: imageData
      });
      
      // Update the undo button visual state
      undoBtn.classList.add('active');
      
      // Mark as changed to trigger prediction
      drawingChanged = true;
    };
    img.src = imageData;
  }
  
  // Delete a sketch from storage
  function deleteSketch(id) {
    savedSketches = savedSketches.filter(sketch => sketch.id !== id);
    localStorage.setItem('importantSketches', JSON.stringify(savedSketches));
    renderSavedSketches();
  }
  
  // Save current canvas as an important sketch
  function saveCurrentSketchAsImportant() {
    if (paths.length === 0) {
      alert('Veuillez dessiner quelque chose d\'abord !');
      return;
    }
    
    const sketchName = prompt('Entrez un nom pour ce croquis:', 'Croquis ' + (savedSketches.length + 1));
    if (!sketchName) return;
    
    const imageData = canvas.toDataURL('image/png');
    
    savedSketches.push({
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      name: sketchName,
      data: imageData
    });
    
    localStorage.setItem('importantSketches', JSON.stringify(savedSketches));
    alert('Croquis enregistré avec succès !');
  }
  
  // Add right-click context menu to canvas for saving sketches
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (paths.length > 0) {
      saveCurrentSketchAsImportant();
    }
    return false;
  });
});