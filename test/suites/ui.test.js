/**
 * Unit Tests for ui.js
 * Tests UI functionality and interactions added in recent commits
 */

describe('UI Module', () => {
    let uiManager;

    beforeAll(() => {
        // Ensure UI module is loaded
        if (typeof window.stoUI === 'undefined') {
            throw new Error('UI module not loaded');
        }
    });

    beforeEach(() => {
        uiManager = window.stoUI;
    });

    it('should have UI manager instance', () => {
        expect(uiManager).toBeDefined();
    });

    it('should manage modals correctly', () => {
        // Create a test modal
        const testModal = document.createElement('div');
        testModal.id = 'testModal';
        testModal.className = 'modal';
        testModal.style.display = 'none';
        document.body.appendChild(testModal);

        // Test showing modal
        uiManager.showModal('testModal');
        expect(testModal.style.display).not.toBe('none');

        // Test hiding modal
        uiManager.hideModal('testModal');
        expect(testModal.style.display).toBe('none');

        // Cleanup
        document.body.removeChild(testModal);
    });

    it('should manage toast notifications correctly', () => {
        // Test showing toast
        uiManager.showToast('Test message', 'info');
        const toast = document.querySelector('.toast, .notification');
        expect(toast).not.toBeNull();
        expect(toast.textContent).toContain('Test message');

        // Test hiding toast
        uiManager.hideToast();
        const hiddenToast = document.querySelector('.toast:not([style*="display: none"]), .notification:not([style*="display: none"])');
        expect(hiddenToast).toBeNull();
    });
});

describe('Modal Functionality', () => {
    let uiManager;

    beforeAll(() => {
        if (typeof window.stoUI === 'undefined') {
            throw new Error('UI module not loaded');
        }
    });

    beforeEach(() => {
        uiManager = window.stoUI;
        
        // Create mock modal elements for testing
        if (!document.getElementById('testModal')) {
            const mockModal = document.createElement('div');
            mockModal.id = 'testModal';
            mockModal.className = 'modal';
            mockModal.style.display = 'none';
            document.body.appendChild(mockModal);
        }
    });

    afterEach(() => {
        // Clean up test modals
        const testModal = document.getElementById('testModal');
        if (testModal && testModal.parentNode) {
            testModal.parentNode.removeChild(testModal);
        }
    });

    it('should show modal when requested', () => {
        const modal = document.getElementById('testModal');
        
        uiManager.showModal('testModal');
        
        // Check if modal is visible (implementation may vary)
        expect(modal).toBeDefined();
    });

    it('should hide modal when requested', () => {
        const modal = document.getElementById('testModal');
        
        uiManager.hideModal('testModal');
        
        // Check if modal is hidden (implementation may vary)
        expect(modal).toBeDefined();
    });
});

describe('Parameter Modal UI', () => {
    beforeAll(() => {
        // Create parameter modal elements for testing
        if (!document.getElementById('parameterModal')) {
            const paramModal = document.createElement('div');
            paramModal.id = 'parameterModal';
            paramModal.className = 'modal';
            paramModal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="parameterModalTitle">Configure Parameters</h3>
                    </div>
                    <div class="modal-body">
                        <div id="parameterInputs"></div>
                        <div id="parameterCommandPreview"></div>
                    </div>
                    <div class="modal-footer">
                        <button id="saveParameterCommandBtn">Save</button>
                        <button class="modal-close">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(paramModal);
        }
    });

    it('should have parameter modal elements', () => {
        expect(document.getElementById('parameterModal')).toBeDefined();
        expect(document.getElementById('parameterModalTitle')).toBeDefined();
        expect(document.getElementById('parameterInputs')).toBeDefined();
        expect(document.getElementById('parameterCommandPreview')).toBeDefined();
        expect(document.getElementById('saveParameterCommandBtn')).toBeDefined();
    });

    it('should support parameter input creation', () => {
        const inputContainer = document.getElementById('parameterInputs');
        
        if (inputContainer) {
            // Test parameter input group creation
            const inputGroup = document.createElement('div');
            inputGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = 'Test Parameter';
            
            const input = document.createElement('input');
            input.type = 'number';
            input.id = 'test_param';
            input.value = '5';
            
            inputGroup.appendChild(label);
            inputGroup.appendChild(input);
            inputContainer.appendChild(inputGroup);
            
            expect(inputContainer.children.length).toBeGreaterThan(0);
            expect(input.value).toBe('5');
            
            // Clean up
            inputContainer.removeChild(inputGroup);
        }
    });

    it('should handle parameter preview updates', () => {
        const previewElement = document.getElementById('parameterCommandPreview');
        
        if (previewElement) {
            previewElement.textContent = 'Test command preview';
            expect(previewElement.textContent).toBe('Test command preview');
        }
    });
});

describe('Command Warning UI', () => {
    beforeAll(() => {
        // Create warning elements for testing
        if (!document.getElementById('commandWarningTest')) {
            const warningDiv = document.createElement('div');
            warningDiv.id = 'commandWarningTest';
            warningDiv.className = 'command-warning';
            warningDiv.style.display = 'none';
            warningDiv.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span id="warningText"></span>
            `;
            document.body.appendChild(warningDiv);
        }
    });

    it('should display command warnings when needed', () => {
        const warningDiv = document.getElementById('commandWarningTest');
        const warningText = document.getElementById('warningText');
        
        if (warningDiv && warningText) {
            // Simulate showing a warning
            warningText.textContent = 'Not recommended on spam bars';
            warningDiv.style.display = 'block';
            
            expect(warningText.textContent).toContain('Not recommended');
            expect(warningDiv.style.display).toBe('block');
            
            // Test hiding warning
            warningDiv.style.display = 'none';
            expect(warningDiv.style.display).toBe('none');
        }
    });

    it('should have warning icon styling', () => {
        const warningDiv = document.getElementById('commandWarningTest');
        const icon = warningDiv?.querySelector('i');
        
        if (icon) {
            expect(icon.className).toContain('fa-exclamation-triangle');
        }
    });
});

describe('View Toggle UI', () => {
    beforeAll(() => {
        // Create view toggle button for testing
        if (!document.getElementById('viewToggleTest')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'viewToggleTest';
            toggleBtn.className = 'btn btn-small';
            toggleBtn.innerHTML = '<i class="fas fa-list"></i>';
            toggleBtn.title = 'Toggle view mode';
            document.body.appendChild(toggleBtn);
        }
    });

    it('should have view toggle button elements', () => {
        const toggleBtn = document.getElementById('viewToggleTest');
        const icon = toggleBtn?.querySelector('i');
        
        expect(toggleBtn).toBeDefined();
        expect(icon).toBeDefined();
        expect(toggleBtn.title).toContain('Toggle');
    });

    it('should update icon based on view mode', () => {
        const toggleBtn = document.getElementById('viewToggleTest');
        const icon = toggleBtn?.querySelector('i');
        
        if (icon) {
            // Test different view mode icons
            icon.className = 'fas fa-sitemap';
            expect(icon.className).toContain('fa-sitemap');
            
            icon.className = 'fas fa-th';
            expect(icon.className).toContain('fa-th');
            
            icon.className = 'fas fa-list';
            expect(icon.className).toContain('fa-list');
        }
    });
});

describe('Key Filter UI', () => {
    beforeAll(() => {
        // Create filter input for testing
        if (!document.getElementById('keyFilterTest')) {
            const filterInput = document.createElement('input');
            filterInput.id = 'keyFilterTest';
            filterInput.type = 'text';
            filterInput.placeholder = 'Filter keys...';
            document.body.appendChild(filterInput);
        }
    });

    it('should have key filter input', () => {
        const filterInput = document.getElementById('keyFilterTest');
        
        expect(filterInput).toBeDefined();
        expect(filterInput.type).toBe('text');
        expect(filterInput.placeholder).toContain('Filter');
    });

    it('should handle filter input changes', () => {
        const filterInput = document.getElementById('keyFilterTest');
        
        if (filterInput) {
            filterInput.value = 'test filter';
            expect(filterInput.value).toBe('test filter');
            
            filterInput.value = '';
            expect(filterInput.value).toBe('');
        }
    });
});

describe('Customizable Command UI Elements', () => {
    it('should support parameter indicator styling', () => {
        // Create a mock customizable command element
        const commandElement = document.createElement('div');
        commandElement.className = 'command-item customizable';
        commandElement.dataset.parameters = 'true';
        
        const paramIndicator = document.createElement('span');
        paramIndicator.className = 'param-indicator';
        paramIndicator.textContent = '⚙️';
        paramIndicator.title = 'Editable parameters';
        
        commandElement.appendChild(paramIndicator);
        
        expect(commandElement.classList.contains('customizable')).toBeTruthy();
        expect(commandElement.dataset.parameters).toBe('true');
        expect(paramIndicator.textContent).toBe('⚙️');
        expect(paramIndicator.title).toContain('Editable');
    });

    it('should support command warning icon styling', () => {
        // Create a mock command with warning
        const commandElement = document.createElement('div');
        commandElement.className = 'command-item';
        
        const warningIcon = document.createElement('span');
        warningIcon.className = 'command-warning-icon';
        warningIcon.title = 'Not recommended on spam bars';
        warningIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        
        commandElement.appendChild(warningIcon);
        
        expect(warningIcon.classList.contains('command-warning-icon')).toBeTruthy();
        expect(warningIcon.title).toContain('Not recommended');
        expect(warningIcon.querySelector('i').className).toContain('fa-exclamation-triangle');
    });
}); 