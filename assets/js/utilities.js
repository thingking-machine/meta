/**
 * Transforms platoHtml format to CMJ (Chat Messages JSON) format.
 * @param {string} platoHtml - The platoHtml formatted string.
 * @returns {Array<Object>} - Array of message objects. (Note: JSDoc says JSON stringified, actual code returns Array)
 */
function platoHtmlToCmj(platoHtml) {
  if (!platoHtml || typeof platoHtml !== 'string') {
    throw new Error('Invalid input: platoHtml must be a non-empty string');
  }

  const messages = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(platoHtml, 'text/html');
  const paragraphs = doc.querySelectorAll('p.dialogue');

  paragraphs.forEach(p => {
    const speakerSpan = p.querySelector('span.speaker');
    if (!speakerSpan) return; // Skip malformed paragraphs

    const speaker = speakerSpan.textContent.trim();

    // --- New utterance extraction logic ---
    const rawHtmlOfP = p.innerHTML;
    const speakerSpanHtml = speakerSpan.outerHTML;
    const speakerSpanEndIndex = rawHtmlOfP.indexOf(speakerSpanHtml) + speakerSpanHtml.length;

    let utteranceHtml = rawHtmlOfP.substring(speakerSpanEndIndex);

    // The template in platoTextToPlatoHtml adds a space: <span ...></span> ${utterance}
    // Remove this specific structural space if it exists.
    if (utteranceHtml.startsWith(' ')) {
        utteranceHtml = utteranceHtml.substring(1);
    }

    // 1. Convert <br />&emsp; (and variants with optional space) to \n\t
    let processedUtterance = utteranceHtml.replace(/<br\s*\/?>\s*&emsp;/gi, '\n\t');

    // 2. Convert remaining <br /> (and variants) to \n
    processedUtterance = processedUtterance.replace(/<br\s*\/?>/gi, '\n');

    // 3. Strip any other HTML tags and decode entities (e.g., &lt; to <)
    // Using a temporary element for this is a standard and robust method.
    const decoder = document.createElement('div');
    decoder.innerHTML = processedUtterance;
    const finalUtterance = decoder.textContent.trim(); // Trim after all processing
    // --- End of new utterance extraction logic ---

    let role = 'user';
    // Safely access machineConfig.name and compare in uppercase
    let assistantNameUpper = '';
    if (typeof machineConfig !== 'undefined' && machineConfig && typeof machineConfig.name === 'string' && machineConfig.name.trim() !== '') {
        assistantNameUpper = machineConfig.name.toUpperCase();
    } else {
        // console.warn("machineConfig.name not available for role assignment in platoHtmlToCmj.");
    }

    if (assistantNameUpper && speaker.toUpperCase() === assistantNameUpper) {
      role = 'assistant';
    } else if (speaker.toUpperCase() === 'INSTRUCTIONS') {
      role = 'system';
    }

    messages.push({
      role: role,
      name: speaker,
      content: finalUtterance
    });
  });

  return messages; // JSDoc indicates string, but function returns Array.
}

/**
 * Transforms platoHtml format to platoText format.
 * @param {string} platoHtml - The platoHtml formatted string.
 * @returns {string} - The platoText formatted string.
 */
function platoHtmlToPlatoText(platoHtml) {
  if (typeof platoHtml !== 'string') {
    throw new Error('Invalid input: platoHtml must be a string');
  }
  if (!platoHtml.trim()) {
    return '';
  }

  let result = '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(platoHtml, 'text/html');
  const paragraphs = doc.querySelectorAll('p.dialogue');

  paragraphs.forEach(p => {
    const speakerSpan = p.querySelector('span.speaker');
    if (!speakerSpan) return;

    const speaker = speakerSpan.textContent.trim();

    // --- New utterance extraction logic ---
    const rawHtmlOfP = p.innerHTML;
    const speakerSpanHtml = speakerSpan.outerHTML;
    const speakerSpanEndIndex = rawHtmlOfP.indexOf(speakerSpanHtml) + speakerSpanHtml.length;

    let utteranceHtml = rawHtmlOfP.substring(speakerSpanEndIndex);

    // The template in platoTextToPlatoHtml adds a space: <span ...></span> ${utterance}
    // Remove this specific structural space if it exists.
    if (utteranceHtml.startsWith(' ')) {
        utteranceHtml = utteranceHtml.substring(1);
    }

    // 1. Convert <br />&emsp; (and variants with optional space) to \n\t
    let processedUtterance = utteranceHtml.replace(/<br\s*\/?>\s*&emsp;/gi, '\n\t');

    // 2. Convert remaining <br /> (and variants) to \n
    processedUtterance = processedUtterance.replace(/<br\s*\/?>/gi, '\n');

    // 3. Strip any other HTML tags and decode entities (e.g., &lt; to <)
    const decoder = document.createElement('div');
    decoder.innerHTML = processedUtterance;
    const finalUtterance = decoder.textContent.trim(); // Trim after all processing
    // --- End of new utterance extraction logic ---

    if (speaker || finalUtterance) { // Ensure there's something to add
        result += `${speaker}: ${finalUtterance}\n\n`;
    }
  });

  return result;
}

/**
 * Transforms platoText format to platoHtml format.
 * @param {string} platoText - The platoText formatted string.
 * @returns {string} - The platoHtml formatted string.
 */
function platoTextToPlatoHtml(platoText) {
  if (typeof platoText !== 'string') {
    throw new Error('Invalid input: platoText must be a string');
  }
  const trimmedPlatoText = platoText.trim();
  if (!trimmedPlatoText) {
    return '';
  }

  let result = '';
  // Split by \n\n only if it's followed by a speaker pattern.
  const messageBlocks = trimmedPlatoText.split(/\n\n(?=[A-Za-z0-9_-]+:\s*)/g);

  messageBlocks.forEach(block => {
    const currentBlock = block.trim();
    if (!currentBlock) return;

    const speakerMatch = currentBlock.match(/^([A-Za-z0-9_-]+):\s*/);
    if (!speakerMatch) {
      // This block doesn't start with a speaker. Could be pre-dialogue text or malformed.
      // Depending on requirements, you might log this or handle it differently.
      // For now, we'll skip it as the primary goal is parsing speaker lines.
      console.warn('platoTextToPlatoHtml: Skipping block that does not start with a speaker pattern:', currentBlock);
      return;
    }

    const speaker = speakerMatch[1];
    const rawUtterance = currentBlock.substring(speakerMatch[0].length);

    // Replace "orphaned" double (or more) newlines within the utterance with '\n\t', then trim.
    // The trim handles cases where an utterance might start or end with newlines.
    const semanticallyProcessedUtterance = rawUtterance.replace(/\n{2,}/g, '\n\t').trim();

    // Escape HTML special characters and format for HTML display
    const escapedAndFormattedUtterance = semanticallyProcessedUtterance
        .replace(/&/g, '&amp;')      // 1. Ampersands first
        .replace(/</g, '&lt;')       // 2. Less than
        .replace(/>/g, '&gt;')       // 3. Greater than
        .replace(/"/g, '&quot;')    // 4. Double quotes
        .replace(/'/g, '&#039;')   // 5. Single quotes (or &apos;)
        .replace(/\t/g, '&emsp;')    // 6. Convert semantic tab to visual em-space for HTML
        .replace(/\n/g, '<br />');   // 7. Convert semantic newline to <br /> for HTML

    result += `<p class="dialogue"><span class="speaker">${speaker}</span> ${escapedAndFormattedUtterance}</p>\n`;
  });

  return result.trimEnd(); // Remove trailing newline if any
}

/**
 * Transforms platoText format to CMJ (Chat Messages JSON) format.
 * @param {string} platoText - The platoText formatted string.
 * @returns {Array<Object>} - Array of message objects. (Note: JSDoc in context says JSON stringified, but code returns Array)
 */
function platoTextToCmj(platoText) {
  if (typeof platoText !== 'string') {
    throw new Error('Invalid input: platoText must be a string');
  }
  const trimmedPlatoText = platoText.trim();
  if (!trimmedPlatoText) {
    return []; // Return empty array for empty or whitespace-only input
  }

  const messages = [];
  // Split by \n\n only if it's followed by a speaker pattern.
  const messageBlocks = trimmedPlatoText.split(/\n\n(?=[A-Za-z0-9_-]+:\s*)/g);

  // Determine assistant name for role assignment
  // Prioritize machineConfig.name if available, otherwise use the literal from original function.
  let effectiveAssistantNameUpper;
  if (typeof machineConfig !== 'undefined' && machineConfig && typeof machineConfig.name === 'string' && machineConfig.name.trim() !== '') {
      effectiveAssistantNameUpper = machineConfig.name.toUpperCase();
  } else {
      effectiveAssistantNameUpper = 'THINGKING-MACHINE'; // Fallback to original literal for this function
  }

  messageBlocks.forEach(block => {
    const currentBlock = block.trim();
    if (!currentBlock) return;

    const speakerMatch = currentBlock.match(/^([A-Za-z0-9_-]+):\s*/);
    if (!speakerMatch) {
      console.warn('platoTextToCmj: Skipping block that does not start with a speaker pattern:', currentBlock);
      return;
    }

    const speaker = speakerMatch[1]; // Speaker name as it appears
    const rawUtterance = currentBlock.substring(speakerMatch[0].length);

    // Replace "orphaned" double (or more) newlines within the utterance with '\n\t', then trim.
    // For CMJ, \n and \t remain literal characters in the content string.
    const processedUtterance = rawUtterance.replace(/\n{2,}/g, '\n\t').trim();

    let role = 'user';
    const speakerUpper = speaker.toUpperCase();

    if (speakerUpper === effectiveAssistantNameUpper) {
      role = 'assistant';
    } else if (speakerUpper === 'INSTRUCTIONS') {
      role = 'system';
    }

    messages.push({
      role: role,
      name: speaker, // Keep original speaker name casing
      content: processedUtterance
    });
  });

  return messages; // Returns an array of objects
}

/**
 * Transforms an array of CMJ message objects to platoText format.
 * @param {Array<Object>} cmjMessages - An array of CMJ message objects.
 *                                      Each object should have 'name' and 'content' properties.
 * @returns {string} - The platoText formatted string.
 */
function CmjToPlatoText(cmjMessages) {
  if (!Array.isArray(cmjMessages)) {
    console.error('Invalid input: cmjMessages must be an array.');
    // Consider throwing an error for more robust handling:
    // throw new Error('Invalid input: cmjMessages must be an array.');
    return ''; // Return empty string if input is not an array
  }
  let platoText = '';

  cmjMessages.forEach(message => {
    // Ensure the message object has the expected 'name' and 'content' properties
    if (message && typeof message.name === 'string' && typeof message.content === 'string') {
      const speaker = message.name.trim(); // Trim individual parts for cleanliness

      // Normalize newlines within the LLM's utterance:
      // - Convert sequences of two or more newlines to '\n\t'
      //   to match platoText's internal paragraph formatting.
      // - Then, trim the result.
      let utterance = message.content.replace(/\n{2,}/g, '\n\t');
      utterance = utterance.trim();

      // Append the formatted string, ensuring it ends with two newlines
      platoText += `${speaker}: ${utterance}\n\n`;
    } else {
      console.warn('Skipping malformed CMJ message object during CmjToPlatoText conversion:', message);
    }
  });
  return platoText;
}
