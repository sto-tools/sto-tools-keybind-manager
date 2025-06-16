// STO Tools Keybind Manager - UI Utilities
// Handles DOM manipulation, notifications, and user interface helpers

class STOUIManager {
    constructor() {
        this.toastQueue = [];
        this.dragState = {
            isDragging: false,
            dragElement: null,
            dragData: null
        };
        
        this.init();
    }

    init() {
        this.setupGlobalEventListeners();
        this.setupTooltips();
    }

    // Toast Notifications
    showToast(message, type = 'info', duration = 3000) {
        const toast = this.createToast(message, type, duration);
        const container = document.getElementById('toastContainer');
        
        if (container) {
            container.appendChild(toast);
            
            // Trigger animation
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
            
            // Auto remove
            setTimeout(() => {
                this.removeToast(toast);
            }, duration);
        }
    }

    createToast(message, type, duration) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const iconMap = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle', 
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${iconMap[type] || iconMap.info}"></i>
                <span class="toast-message">${message}</span>
                <button class="toast-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Add close button functionality
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toast);
        });
        
        return toast;
    }

    removeToast(toast) {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // Modal Management
    showModal(modalId, data = null) {
        const overlay = document.getElementById('modalOverlay');
        const modal = document.getElementById(modalId);
        
        if (overlay && modal) {
            overlay.classList.add('active');
            modal.classList.add('active');
            document.body.classList.add('modal-open');
            
            // Focus first input if available
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
            
            // Populate modal data if provided
            if (data) {
                this.populateModalData(modalId, data);
            }
            
            return true;
        }
        return false;
    }

    hideModal(modalId) {
        const overlay = document.getElementById('modalOverlay');
        const modal = document.getElementById(modalId);
        
        if (overlay && modal) {
            overlay.classList.remove('active');
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
            
            // Clear modal data
            this.clearModalData(modalId);
            
            return true;
        }
        return false;
    }

    hideAllModals() {
        const overlay = document.getElementById('modalOverlay');
        const modals = document.querySelectorAll('.modal.active');
        
        if (overlay) {
            overlay.classList.remove('active');
        }
        
        modals.forEach(modal => {
            modal.classList.remove('active');
        });
        
        document.body.classList.remove('modal-open');
    }

    populateModalData(modalId, data) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // Generic data population
        Object.entries(data).forEach(([key, value]) => {
            const element = modal.querySelector(`[data-field="${key}"], #${key}`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            }
        });
    }

    clearModalData(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        const inputs = modal.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                input.checked = false;
            } else {
                input.value = '';
            }
        });
    }

    // Loading States
    showLoading(element, text = 'Loading...') {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        
        if (element) {
            element.classList.add('loading');
            const originalContent = element.innerHTML;
            element.dataset.originalContent = originalContent;
            element.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>${text}</span>
                </div>
            `;
            element.disabled = true;
        }
    }

    hideLoading(element) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        
        if (element && element.classList.contains('loading')) {
            element.classList.remove('loading');
            element.innerHTML = element.dataset.originalContent || '';
            element.disabled = false;
            delete element.dataset.originalContent;
        }
    }

    // Confirmation Dialogs
    async confirm(message, title = 'Confirm', type = 'warning') {
        return new Promise((resolve) => {
            const confirmModal = this.createConfirmModal(message, title, type);
            document.body.appendChild(confirmModal);
            
            const handleConfirm = (result) => {
                document.body.removeChild(confirmModal);
                resolve(result);
            };
            
            confirmModal.querySelector('.confirm-yes').addEventListener('click', () => {
                handleConfirm(true);
            });
            
            confirmModal.querySelector('.confirm-no').addEventListener('click', () => {
                handleConfirm(false);
            });
            
            // Show modal
            requestAnimationFrame(() => {
                confirmModal.classList.add('active');
            });
        });
    }

    createConfirmModal(message, title, type) {
        const modal = document.createElement('div');
        modal.className = 'modal confirm-modal active';
        
        const iconMap = {
            warning: 'fa-exclamation-triangle',
            danger: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };
        
        modal.innerHTML = `
            <div class="modal-overlay active"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas ${iconMap[type] || iconMap.warning}"></i>
                        ${title}
                    </h3>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary confirm-yes">Yes</button>
                    <button class="btn btn-secondary confirm-no">No</button>
                </div>
            </div>
        `;
        
        return modal;
    }

    // Drag and Drop Helpers
    initDragAndDrop(container, options = {}) {
        const {
            dragSelector = '.draggable',
            dropZoneSelector = '.drop-zone',
            onDragStart = null,
            onDragEnd = null,
            onDrop = null
        } = options;
        
        // Make items draggable
        container.addEventListener('dragstart', (e) => {
            if (e.target.matches(dragSelector)) {
                this.dragState.isDragging = true;
                this.dragState.dragElement = e.target;
                this.dragState.dragData = e.target.dataset;
                
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                
                if (onDragStart) onDragStart(e, this.dragState);
            }
        });
        
        container.addEventListener('dragend', (e) => {
            if (e.target.matches(dragSelector)) {
                e.target.classList.remove('dragging');
                this.dragState.isDragging = false;
                this.dragState.dragElement = null;
                this.dragState.dragData = null;
                
                if (onDragEnd) onDragEnd(e);
            }
        });
        
        // Handle drop zones
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dropZone = e.target.closest(dropZoneSelector);
            if (dropZone) {
                dropZone.classList.add('drag-over');
            }
        });
        
        container.addEventListener('dragleave', (e) => {
            const dropZone = e.target.closest(dropZoneSelector);
            if (dropZone) {
                dropZone.classList.remove('drag-over');
            }
        });
        
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            const dropZone = e.target.closest(dropZoneSelector);
            if (dropZone) {
                dropZone.classList.remove('drag-over');
                
                if (onDrop) {
                    onDrop(e, this.dragState, dropZone);
                }
            }
        });
    }

    // Form Validation
    validateForm(formElement) {
        const errors = [];
        const inputs = formElement.querySelectorAll('input[required], textarea[required], select[required]');
        
        inputs.forEach(input => {
            const value = input.value.trim();
            const fieldName = input.dataset.fieldName || input.name || input.id;
            
            if (!value) {
                errors.push(`${fieldName} is required`);
                input.classList.add('error');
            } else {
                input.classList.remove('error');
                
                // Type-specific validation
                if (input.type === 'email' && !this.isValidEmail(value)) {
                    errors.push(`${fieldName} must be a valid email`);
                    input.classList.add('error');
                }
            }
        });
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Clipboard Operations
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard', 'success');
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                this.showToast('Copied to clipboard', 'success');
                return true;
            } catch (fallbackErr) {
                this.showToast('Failed to copy to clipboard', 'error');
                return false;
            } finally {
                document.body.removeChild(textArea);
            }
        }
    }

    // Animation Helpers
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        let start = null;
        const animate = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const opacity = Math.min(progress / duration, 1);
            
            element.style.opacity = opacity;
            
            if (progress < duration) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    fadeOut(element, duration = 300) {
        let start = null;
        const animate = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const opacity = Math.max(1 - (progress / duration), 0);
            
            element.style.opacity = opacity;
            
            if (progress < duration) {
                requestAnimationFrame(animate);
            } else {
                element.style.display = 'none';
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Utility Methods
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Setup Methods
    setupGlobalEventListeners() {
        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
            }
        });
        
        // Click outside modal to close
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.hideAllModals();
            }
        });
    }

    setupTooltips() {
        // Simple tooltip implementation
        document.addEventListener('mouseenter', (e) => {
            if (e.target && typeof e.target.hasAttribute === 'function' && 
                e.target.hasAttribute('title') && e.target.getAttribute('title').trim()) {
                this.showTooltip(e.target, e.target.getAttribute('title'));
            }
        }, true);
        
        document.addEventListener('mouseleave', (e) => {
            if (e.target && typeof e.target.hasAttribute === 'function' && 
                e.target.hasAttribute('title')) {
                this.hideTooltip();
            }
        }, true);
    }

    showTooltip(element, text) {
        this.hideTooltip(); // Remove any existing tooltip
        
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = text;
        tooltip.id = 'active-tooltip';
        
        document.body.appendChild(tooltip);
        
        // Position tooltip
        const rect = element.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        let top = rect.top - tooltipRect.height - 8;
        
        // Adjust if tooltip goes off screen
        if (left < 8) left = 8;
        if (left + tooltipRect.width > window.innerWidth - 8) {
            left = window.innerWidth - tooltipRect.width - 8;
        }
        if (top < 8) {
            top = rect.bottom + 8;
            tooltip.classList.add('tooltip-bottom');
        }
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        
        // Show tooltip
        requestAnimationFrame(() => {
            tooltip.classList.add('show');
        });
    }

    hideTooltip() {
        const tooltip = document.getElementById('active-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }
}

// Global UI manager instance
window.stoUI = new STOUIManager(); 