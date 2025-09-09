/**
 * Advanced Color Picker component for the Imagination Platform
 * 
 * This script handles the creation and interaction with the advanced color picker.
 * It provides a professional color selection interface with hue slider, saturation/value palette,
 * and RGB/HSV controls.
 */

class ColorPicker {
  constructor(options = {}) {
    this.onChange = options.onChange || function() {};
    this.container = options.container;
    this.currentColor = options.initialColor || '#000000';
    this.hue = 0;
    this.saturation = 0;
    this.value = 0;
    this.pickerVisible = false;
    
    // Convert initial color to HSV
    this._updateHSVFromHex(this.currentColor);
    
    this._createElements();
    this._setupEvents();
    this._updateColorFromHSV();
    this._updateUI();
  }
  
  _createElements() {
    // Main color picker container
    this.pickerEl = document.createElement('div');
    this.pickerEl.className = 'advanced-color-picker';
    
    // SV palette (Saturation and Value)
    this.svPalette = document.createElement('div');
    this.svPalette.className = 'sv-palette';
    
    // Color indicator that moves in the SV palette
    this.svCursor = document.createElement('div');
    this.svCursor.className = 'sv-cursor';
    this.svPalette.appendChild(this.svCursor);
    
    // Hue slider
    this.hueContainer = document.createElement('div');
    this.hueContainer.className = 'hue-container';
    
    this.hueSlider = document.createElement('input');
    this.hueSlider.type = 'range';
    this.hueSlider.min = '0';
    this.hueSlider.max = '359';
    this.hueSlider.value = this.hue;
    this.hueSlider.className = 'hue-slider';
    this.hueContainer.appendChild(this.hueSlider);
    
    // Color controls section
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.className = 'color-controls';
    
    // Current color preview
    this.colorPreview = document.createElement('div');
    this.colorPreview.className = 'color-preview';
    this.controlsContainer.appendChild(this.colorPreview);
    
    // Button container
    this.buttonContainer = document.createElement('div');
    this.buttonContainer.className = 'button-container';
    
    // Apply button
    this.applyBtn = document.createElement('button');
    this.applyBtn.textContent = 'Appliquer';
    this.applyBtn.className = 'apply-btn';
    this.buttonContainer.appendChild(this.applyBtn);
    
    // Cancel button
    this.cancelBtn = document.createElement('button');
    this.cancelBtn.textContent = 'Annuler';
    this.cancelBtn.className = 'cancel-btn';
    this.buttonContainer.appendChild(this.cancelBtn);
    
    // Assemble the picker
    this.pickerEl.appendChild(this.svPalette);
    this.pickerEl.appendChild(this.hueContainer);
    this.pickerEl.appendChild(this.controlsContainer);
    this.pickerEl.appendChild(this.buttonContainer);
    
    // Add to the container
    this.container.appendChild(this.pickerEl);
    
    // Initially hide the picker
    this.pickerEl.classList.add('hidden');
  }
  
  _setupEvents() {
    // Hue slider event
    this.hueSlider.addEventListener('input', () => {
      this.hue = parseInt(this.hueSlider.value);
      this._updateSVPaletteBackground();
      this._updateColorFromHSV();
      this._updateUI();
    });
    
    // SV palette events
    this.svPalette.addEventListener('mousedown', (e) => {
      this._handleSVPaletteInteraction(e);
      
      const handleMouseMove = (e) => {
        this._handleSVPaletteInteraction(e);
      };
      
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
    
    // Handle touch events for SV palette
    this.svPalette.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._handleSVPaletteInteraction(e.touches[0]);
      
      const handleTouchMove = (e) => {
        e.preventDefault();
        this._handleSVPaletteInteraction(e.touches[0]);
      };
      
      const handleTouchEnd = () => {
        this.svPalette.removeEventListener('touchmove', handleTouchMove);
        this.svPalette.removeEventListener('touchend', handleTouchEnd);
      };
      
      this.svPalette.addEventListener('touchmove', handleTouchMove, { passive: false });
      this.svPalette.addEventListener('touchend', handleTouchEnd);
    }, { passive: false });
    
    // No hex or RGB input events needed
    
    // Button events
    this.applyBtn.addEventListener('click', () => {
      this.hide();
      this.onChange(this.currentColor);
    });
    
    this.cancelBtn.addEventListener('click', () => {
      this.hide();
    });
  }
  
  _handleSVPaletteInteraction(e) {
    const rect = this.svPalette.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    
    // Constrain within bounds
    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));
    
    // Calculate saturation and value
    this.saturation = x / rect.width;
    this.value = 1 - (y / rect.height);
    
    this._updateColorFromHSV();
    this._updateUI();
  }
  
  _updateSVPaletteBackground() {
    // Set the background gradient based on the current hue
    this.svPalette.style.background = `linear-gradient(to right, 
      hsl(${this.hue}, 0%, 50%), 
      hsl(${this.hue}, 100%, 50%))`;
    
    this.svPalette.style.backgroundImage = `
      linear-gradient(to right, white, transparent),
      linear-gradient(to bottom, transparent, black),
      linear-gradient(to right, hsl(${this.hue}, 100%, 50%), hsl(${this.hue}, 100%, 50%))
    `;
  }
  
  _updateColorFromHSV() {
    // Convert HSV to RGB then to hex
    this.currentColor = this._hsvToHex(this.hue, this.saturation, this.value);
  }
  
  _updateHSVFromHex(hex) {
    const rgb = this._hexToRgb(hex);
    const hsv = this._rgbToHsv(rgb.r, rgb.g, rgb.b);
    
    this.hue = hsv.h;
    this.saturation = hsv.s;
    this.value = hsv.v;
  }
  
  _updateUI() {
    // Update cursor position
    this.svCursor.style.left = `${this.saturation * 100}%`;
    this.svCursor.style.top = `${(1 - this.value) * 100}%`;
    
    // Update hue slider
    this.hueSlider.value = this.hue;
    
    // Update color preview
    this.colorPreview.style.backgroundColor = this.currentColor;
    
    // Update SV palette background
    this._updateSVPaletteBackground();
  }
  
  // Color conversion utilities
  _hexToRgb(hex) {
    let r = 0, g = 0, b = 0;
    
    // Handle both #rgb and #rrggbb formats
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.substring(1, 3), 16);
      g = parseInt(hex.substring(3, 5), 16);
      b = parseInt(hex.substring(5, 7), 16);
    }
    
    return { r, g, b };
  }
  
  _rgbToHex(r, g, b) {
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));
    
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
  
  _rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let h = 0;
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    
    if (delta !== 0) {
      if (max === r) {
        h = ((g - b) / delta) % 6;
      } else if (max === g) {
        h = (b - r) / delta + 2;
      } else {
        h = (r - g) / delta + 4;
      }
      
      h *= 60;
      if (h < 0) h += 360;
    }
    
    return { h: Math.round(h), s, v };
  }
  
  _hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    
    let r = 0, g = 0, b = 0;
    
    if (h < 60) {
      r = c; g = x; b = 0;
    } else if (h < 120) {
      r = x; g = c; b = 0;
    } else if (h < 180) {
      r = 0; g = c; b = x;
    } else if (h < 240) {
      r = 0; g = x; b = c;
    } else if (h < 300) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return { r, g, b };
  }
  
  _hsvToHex(h, s, v) {
    const rgb = this._hsvToRgb(h, s, v);
    return this._rgbToHex(rgb.r, rgb.g, rgb.b);
  }
  
  // Public methods
  getColor() {
    return this.currentColor;
  }
  
  setColor(color) {
    this.currentColor = color;
    this._updateHSVFromHex(color);
    this._updateUI();
  }
  
  show() {
    this.pickerEl.classList.remove('hidden');
    this.pickerVisible = true;
    this._updateUI();
  }
  
  hide() {
    this.pickerEl.classList.add('hidden');
    this.pickerVisible = false;
  }
  
  toggle() {
    if (this.pickerVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  isVisible() {
    return this.pickerVisible;
  }
}
