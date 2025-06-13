document.addEventListener('DOMContentLoaded', () => {
    const llmSettings = {};
    const queryParams = new URLSearchParams(window.location.search);

    for (const [key, value] of queryParams.entries()) {
        // Parse floats.
        if (['temperature', 'repetition_penalty', 'top_p', 'top_k'].includes(key)) {
            const numValue = parseFloat(value);
            llmSettings[key] = isNaN(numValue) ? value : numValue;
        // Parse integers.
        } else if (key === 'max_completion_tokens') {
            const numValue = parseInt(value, 10);
            llmSettings[key] = isNaN(numValue) ? value : numValue;
        // Just assign text values.
        } else {
            llmSettings[key] = value;
        }
      }
    // Make the parameters globally available (but the worker will not see them).
    window.llmSettings = llmSettings;
    console.log('LLM Settings:', window.llmSettings)

    const contentContainer = document.querySelector('.container-md.markdown-body');
    const h1Element = contentContainer.querySelector('h1');
    const originalStaticDialogueElements = Array.from(contentContainer.querySelectorAll('p.dialogue'));
    let initialHtmlFromStatic = '';
    originalStaticDialogueElements.forEach(p => {
        initialHtmlFromStatic += p.outerHTML;
        p.style.display = 'none';
    });

    // 1. Create a wrapper for the dialogue content (will be populated by updateDisplayState)
    const dialogueWrapper = document.createElement('div');
    dialogueWrapper.id = 'dialogue-content-wrapper';
    dialogueWrapper.style.paddingBottom = '20px'; // Visible end of dialogue text.

    // 2. Create the textarea for editing
    const textarea = document.createElement('textarea');
    textarea.id = 'editor';
    textarea.name = 'editor-textarea';
    textarea.className = 'form-control';
    textarea.style.width = '100%';
    textarea.style.minHeight = '830px';
    textarea.style.display = 'none'; // Initially hidden
    textarea.style.setProperty('border', '1px solid lightgrey', 'important');
    textarea.style.padding = '10px';

    // 3. Create container and button for file picking
    const filePickerContainer = document.createElement('div');
    filePickerContainer.id = 'file-picker-container';
    filePickerContainer.style.width = '100%';
    filePickerContainer.style.minHeight = '830px'; // Match textarea height
    filePickerContainer.style.display = 'flex';
    filePickerContainer.style.justifyContent = 'center';
    filePickerContainer.style.alignItems = 'center';
    filePickerContainer.style.padding = '20px';
    filePickerContainer.style.display = 'none'; // Initially hidden, updateDisplayState will show it

    const chooseFileButton = document.createElement('button');
    chooseFileButton.id = 'chooseFileButton';
    chooseFileButton.className = 'btn btn-primary'; // GitHub Primer style
    chooseFileButton.textContent = 'Choose File to Load Dialogue';
    chooseFileButton.style.padding = '10px 20px'; // Make button larger
    chooseFileButton.style.fontSize = '1.0rem';
    filePickerContainer.appendChild(chooseFileButton);

    // 4. Insert dynamic elements into the DOM (after H1 or fallback)
    if (h1Element) {
        h1Element.after(dialogueWrapper, textarea, filePickerContainer);
    } else {
        contentContainer.prepend(dialogueWrapper, textarea, filePickerContainer);
    }

    // 5. Initialize localStorage:
    // Use existing 'multilogue'. Otherwise, try to populate from static HTML.
    let platoTextForInit = localStorage.getItem('multilogue');
    if (platoTextForInit === null) {
        if (initialHtmlFromStatic.trim() !== '') {
            try {
                platoTextForInit = platoHtmlToPlatoText(initialHtmlFromStatic);
            } catch (e) {
                console.error("Error converting initial static HTML to Plato text:", e);
                platoTextForInit = '';
            }
        } else {
            platoTextForInit = '';
        }
        localStorage.setItem('multilogue', platoTextForInit);
    }

    function updateDisplayState() {
        const currentPlatoText = localStorage.getItem('multilogue');
        if (currentPlatoText && currentPlatoText.trim() !== '') {
            try {
                dialogueWrapper.innerHTML = platoTextToPlatoHtml(currentPlatoText);
            } catch (e) {
                console.error("Error rendering Plato text to HTML:", e);
                dialogueWrapper.innerHTML = "<p class='dialogue-error'>Error loading content. Please try editing or loading a new file.</p>";
            }
            dialogueWrapper.style.display = 'block';
            textarea.style.display = 'none';
            filePickerContainer.style.display = 'none';
            dialogueWrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
            dialogueWrapper.style.display = 'none';
            textarea.style.display = 'none';
            filePickerContainer.style.display = 'flex';
            dialogueWrapper.innerHTML = '';
            textarea.value = '';
        }
    }
    updateDisplayState();

    // Helper function to send data to the message broker
    function sendPlatoTextToBroker(platoText) {
        const event = new CustomEvent('sendToBroker', {
            detail: {
                message: platoText // content.js expects event.detail.message
            }
        });
        document.dispatchEvent(event);
        console.log("Page: Dispatched 'sendToBroker' event with PlatoText.");
    }

    chooseFileButton.addEventListener('click', async () => {
        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Text Files',
                    accept: { 'text/plain': ['.txt', '.md', '.text', '.plato'] }
                }]
            });
            const file = await fileHandle.getFile();
            const fileContent = await file.text();
            localStorage.setItem('multilogue', fileContent);
            textarea.value = fileContent; // Go directly to editor after loading
            dialogueWrapper.style.display = 'none';
            filePickerContainer.style.display = 'none';
            textarea.style.display = 'block';
            textarea.focus();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error opening file:', err);
                alert(`Error opening file: ${err.message}`);
            }
        }
    });
    // 10. Click on text
    dialogueWrapper.addEventListener('click', () => {
        try {
            const plainText = localStorage.getItem('multilogue') || '';
            textarea.value = plainText;
            dialogueWrapper.style.display = 'none';
            textarea.style.display = 'block';
            filePickerContainer.style.display = 'none';
            textarea.focus();
        } catch (e) {
            console.error("Error preparing text for editing:", e);
            alert("Could not switch to edit mode due to a content error.");
        }
    });
    // 11. Save to file from edit mode
    textarea.addEventListener('keydown', (event) => {
        if (event.ctrlKey && !event.shiftKey && event.key === 'Enter') {
            event.preventDefault();
            const newText = textarea.value;
            localStorage.setItem('multilogue', newText);
            updateDisplayState();
        }
    });
    // 12. Event listener for Ctrl+Shift+Enter for saving a file
    document.addEventListener('keydown', async (event) => {
        if (event.ctrlKey && event.shiftKey && event.key === 'Enter') {
            event.preventDefault();
            const textToSave = localStorage.getItem('multilogue') || '';

            if (!textToSave.trim()) {
                console.log('Ctrl+Shift+Enter: Dialogue content is empty. Nothing to save.');
                alert('Dialogue is empty. Nothing to save.');
                return; // Prevent saving an empty file
            }

            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: 'multilogue.txt',
                    types: [{
                        description: 'Text Files',
                        accept: { 'text/plain': ['.txt', '.md', '.text', '.plato'] },
                    }],
                });
                const writable = await fileHandle.createWritable();
                await writable.write(textToSave);
                await writable.close();
                localStorage.setItem('multilogue', textToSave);
                // --- SEND TO BROKER on file save ---
                // sendPlatoTextToBroker(textToSave);
                // --- END SEND TO BROKER ---
                updateDisplayState();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Error saving file:', err);
                    alert(`Could not save file: ${err.message}`);
                }
            }
        }
    });
    // 12. Event listener for LLM communications Alt+Shift
    document.addEventListener('keydown', function(event) {
        if (event.altKey && event.shiftKey) {
            event.preventDefault();
            const currentDialogueWrapper = document.getElementById('dialogue-content-wrapper');
            if (!currentDialogueWrapper) {
                console.error('Alt+Shift: dialogue-content-wrapper not found.');
                alert('Error: Could not find the dialogue content to send.');
                return;
            }
            const htmlContent = currentDialogueWrapper.innerHTML;
            if (!htmlContent || htmlContent.trim() === '') {
                alert('Dialogue is empty. Please add some content first.');
                return;
            }

            try {
                const cmjMessages = platoHtmlToCmj(htmlContent); // Ensure platoHtmlToCmj is global
                const userQueryParameters = {
                    config: window.machineConfig,
                    settings: window.llmSettings,
                    messages: cmjMessages
                };

                const llmWorker = new Worker(window.machineConfig.work); // Ensure window.machineConfig.work is set

                llmWorker.onmessage = function(e) {
                    if (e.data.type === 'success') {
                        try {
                            const llmResponseData = e.data.data;
                            if (!llmResponseData || !llmResponseData.content || !llmResponseData.content.text) {
                                console.error('LLM response is missing content text.');
                                alert('Received an invalid response from the LLM.');
                                return;
                            }
                            const newCmjMessage = {
                                role: llmResponseData.role,
                                name: window.machineConfig.name, // Ensure window.machineConfig.name is set
                                content: llmResponseData.content.text
                            };
                            cmjMessages.push(newCmjMessage);
                            const updatedPlatoText = CmjToPlatoText(cmjMessages);
                            if (typeof updatedPlatoText !== 'string') {
                                console.error('Failed to convert updated CMJ to PlatoText.');
                                alert('Error processing the LLM response for display.');
                                return;
                            }

                            localStorage.setItem('multilogue', updatedPlatoText);

                            // --- SEND TO BROKER after LLM response ---
                            // sendPlatoTextToBroker(updatedPlatoText);
                            // --- END SEND TO BROKER ---

                            updateDisplayState();

                        } catch (processingError) {
                            console.error('Error processing LLM response:', processingError);
                            alert('An error occurred while processing the LLM response: ' + processingError.message);
                        }
                    } else if (e.data.type === 'error') {
                        console.error('Main thread: Error message from worker:', e.data.error);
                        alert('Worker reported an error: ' + e.data.error);
                    }
                };
                llmWorker.onerror = function(error) {
                    console.error('Main thread: An error occurred with the worker script:', error.message, error);
                    alert('Failed to initialize or run worker: ' + error.message);
                };
                llmWorker.postMessage(userQueryParameters);

            } catch (e) {
                console.error('Alt+Shift: Failed to process dialogue or communicate with the worker:', e);
                alert('Error preparing data for LLM: ' + e.message);
            }
        }
    });
    // 13. Listen for storage changes to multilogue (e.g., from extension)
    window.addEventListener('storage', function(event) {
        // This event fires in the current page when localStorage is changed by another
        // document context (e.g., the content script in the same tab, or another tab).
        if (event.key === 'multilogue') {
            console.log('Page Script: "multilogue" changed in localStorage. Updating display.');
            updateDisplayState();
        }
    });
    // 14. Update display when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            updateDisplayState();
        }
    });
});
