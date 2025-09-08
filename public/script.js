

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
  const togglePanelBtn = document.getElementById('togglePanel');
  const eraserBtn = document.getElementById('eraserBtn');
  const sizeSlider = document.getElementById('sizeSlider');
  const currentColorDisplay = document.getElementById('currentColor');
  const colorMenu = document.getElementById('colorMenu');
  const undoBtn = document.getElementById('undoBtn');
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

  // State variables
  let isDrawing = false;
  let isErasing = false;
  let brushSize = parseInt(sizeSlider.value, 10);
  let currentColor = '#000000';
  let paths = []; // stack of drawn strokes for undo
  let currentPath = [];
  let drawingChanged = false;
  let predictionIntervalId;
  let promptTimeoutId;
  let lastGuess = '';
  let lastAnswer = '';
  let selectedStyle = '';
  
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

  // Colour palette (2 rows of 4)
  const palette = [
    '#000000', // Black
    '#007aff', // Blue
    '#ffd60a', // Yellow
    '#34c759', // Green
    '#ff9500', // Orange
    '#af52de', // Purple
    '#a2845e', // Brown
    '#ff3b30', // Red
  ];

  // Style options
  const styles = [
    'Aquarelle',
    'Illustration',
    'Pop Art',
    'Croquis',
    'Dessin Animé 3D',
    'Peinture à l\'huile',
  ];

  /**
   * Initialise the drawing canvas to fill the window and set up event handlers.
   */
  function initCanvas() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events for mobile
    canvas.addEventListener('touchstart', (e) => startDrawing(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      draw(e.touches[0]);
    }, { passive: false });
    window.addEventListener('touchend', stopDrawing);
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
   * Begin a new stroke on mousedown/touchstart.
   */
  function startDrawing(e) {
    isDrawing = true;
    currentPath = [];
    drawingChanged = true;
    draw(e);
  }

  /**
   * Draw a line segment to the current cursor position.
   */
  function draw(e) {
    if (!isDrawing) return;
    const { x, y } = getCanvasPos(e);
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
   * Finish the current stroke on mouseup/touchend.
   */
  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentPath.length > 0) {
      paths.push({
        points: currentPath.slice(),
        color: isErasing ? '#ffffff' : currentColor,
        size: brushSize,
      });
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

  /**
   * Toggle the side panel open or closed.
   */
  function toggleSidePanel() {
    if (sidePanel.classList.contains('closed')) {
      sidePanel.classList.remove('closed');
    } else {
      sidePanel.classList.add('closed');
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
   * Populate the colour menu with palette swatches.
   */
  function initColourMenu() {
    palette.forEach((col) => {
      const swatch = document.createElement('div');
      swatch.className = 'colorOption';
      swatch.style.background = col;
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        setColour(col);
        colorMenu.classList.add('hidden');
      });
      colorMenu.appendChild(swatch);
    });
    currentColorDisplay.style.background = currentColor;
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
    
    // Background images for each style that fit the container size
    const styleImages = {
      'Watercolor': 'url("https://cdn.pixabay.com/photo/2017/08/30/12/45/girl-2696947_640.jpg")',
      'Illustration': 'url("https://cdn.pixabay.com/photo/2017/01/12/05/22/colorful-1973736_640.jpg")',
      'Pop Art': 'url("https://cdn.pixabay.com/photo/2016/11/18/16/55/art-1835828_640.jpg")',
      'Sketch': 'url("https://cdn.pixabay.com/photo/2017/07/03/20/17/abstract-2468874_640.jpg")',
      '3D Cartoon': 'url("https://cdn.pixabay.com/photo/2019/10/25/06/20/pig-4576208_640.jpg")',
      'Oil Painting': 'url("https://cdn.pixabay.com/photo/2020/01/02/09/32/art-4735443_640.jpg")',
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
      const item = document.createElement('div');
      item.className = 'styleItem';
      // Set background image via CSS variable
      item.style.setProperty('--bg-image', styleImages[style] || 'none');
      item.addEventListener('click', () => {
        // Deactivate previous
        document.querySelectorAll('.styleItem').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
        selectedStyle = style;
      });
      // Add text span for style name
      const textSpan = document.createElement('span');
      textSpan.className = 'styleText';
      textSpan.textContent = style;
      item.appendChild(textSpan);
      // Set background image using ::before via inline style
      item.style.setProperty('background-image', styleImages[style] || 'none');
      carouselContainer.appendChild(item);
    });
    
    // Assemble the carousel components (without navigation buttons)
    carouselWrapper.appendChild(carouselContainer);
    styleCarousel.appendChild(carouselWrapper);
    
    // Add animation effect to generate button when a style is selected
    document.querySelectorAll('.styleItem').forEach(item => {
      item.addEventListener('click', () => {
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
    };
    
    // Set up image load success handler
    resultImage.onload = function() {
      console.log('Image loaded successfully!');
      
      // Create a notice about which API was used
      const apiNotice = document.createElement('div');
      apiNotice.className = 'api-notice';
      apiNotice.textContent = imageUrl.includes('runware') ? 
        'Image générée avec API de secours (Runware)' : 
        'Image générée avec Fal AI';
      resultContainer.appendChild(apiNotice);
    };
    
    // Set image source and show container
    resultImage.src = imageUrl;
    resultContainer.classList.remove('hidden');
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

  // Toggle the side panel open/closed
  togglePanelBtn.addEventListener('click', toggleSidePanel);

  // Eraser button toggles erasing mode
  eraserBtn.addEventListener('click', () => {
    isErasing = !isErasing;
    if (isErasing) {
      eraserBtn.classList.add('active-eraser');
      eraserBtn.classList.remove('active');
    } else {
      eraserBtn.classList.remove('active-eraser');
    }
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

  // Undo button pops the last path and redraws
  undoBtn.addEventListener('click', () => {
    if (paths.length > 0) {
      paths.pop();
      redraw();
    }
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
    if (paths.length === 0) {
      alert('Veuillez dessiner quelque chose d\'abord !');
      return;
    }
    // Cancel any pending prompt
    hidePrompt();
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
      hideLoader();
      if (res.ok && json.image) {
        showResult(json.image);
      } else {
        console.error('Generation error:', json.error);
        alert('Une erreur est survenue lors de la génération de l\'image.');
      }
    } catch (err) {
      hideLoader();
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