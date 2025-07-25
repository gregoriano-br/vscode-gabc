// main.js

const vscode = require('vscode');

// This Map will store references to your active webview panels
// keyed by the URI of the GABC document they are previewing.
const activePanels = new Map();

/**
 * This function is called when your extension is activated.
 * Activation events are defined in package.json (e.g., onLanguage:gabc, onCommand:...)
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Your "GABC Gregorian Chant Notation" extension is now active!');

    // Register the command that will show the GABC preview.
    // The command ID here MUST match the "command" field in package.json's "commands" and "menus" sections.
    let disposable = vscode.commands.registerCommand('gabcsviewer.showGabcsPreview', () => {
        // Get the currently active text editor
        const editor = vscode.window.activeTextEditor;

        // Check if there's an active editor and if it's a GABC file
        if (!editor || editor.document.languageId !== 'gabc') {
            vscode.window.showInformationMessage('Please open a GABC file to see the preview.');
            return; // Exit if not a GABC file
        }

        const gabcText = editor.document.getText();
        const metadata = parseGabcMetadata(gabcText); // Extract metadata

        // Get the URI of the currently open GABC document
        const documentUri = editor.document.uri.toString();

        // Check if a panel for this document already exists
        let panel = activePanels.get(documentUri);

        if (panel) {
            // If the panel exists, just reveal it (bring it to the front)
            panel.reveal(vscode.ViewColumn.Two); // Show in the second column
        } else {
            // If no panel exists for this document, create a new one
            panel = vscode.window.createWebviewPanel(
                'gabcsPreview', // Internal ID for the webview type
                `Preview: ${editor.document.fileName}`, // Title displayed to the user
                vscode.ViewColumn.Two, // Where to show the panel (e.g., beside the current editor)
                {
                    enableScripts: true // Set to true if your HTML will use JavaScript
                }
            );

            // Store the newly created panel in our map
            activePanels.set(documentUri, panel);

            // Set up a listener for when the panel is closed by the user
            panel.onDidDispose(() => {
                // Remove the panel from our map when it's disposed
                activePanels.delete(documentUri);
            }, null, context.subscriptions);
        }

        // Update the webview's HTML content with the current GABC file's text and metadata
        panel.webview.html = getWebviewContent(gabcText, metadata);
    });

    // Add the disposable (the command registration) to the extension's subscriptions.
    // This ensures it's properly disposed of when the extension is deactivated.
    context.subscriptions.push(disposable);

    // Optional: Add a listener to update the preview automatically when the GABC file changes
    vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'gabc') {
            const documentUri = event.document.uri.toString();
            const panel = activePanels.get(documentUri);
            if (panel) {
                const gabcText = event.document.getText();
                const metadata = parseGabcMetadata(gabcText);
                // If a preview panel exists for the modified document, update its content
                panel.webview.html = getWebviewContent(gabcText, metadata);
            }
        }
    });
}

/**
 * Helper function to parse GABC metadata.
 * @param {string} gabcText The raw text content of the GABC file.
 * @returns {{name: string, transcriber: string}} An object containing extracted metadata.
 */
function parseGabcMetadata(gabcText) {
    const metadata = {
        name: '',
        transcriber: ''
    };

    // Regex to capture 'name: VALUE;'
    const nameMatch = gabcText.match(/^name:\s*(.*?);/m); // [16]
    if (nameMatch && nameMatch[1]) {
        metadata.name = nameMatch[1].trim();
    }

    // Regex to capture 'transcriber: VALUE;'
    const transcriberMatch = gabcText.match(/^transcriber:\s*(.*?);/m); // [16]
    if (transcriberMatch && transcriberMatch[1]) {
        metadata.transcriber = transcriberMatch[1].trim();
    }

    return metadata;
}

/**
 * Helper function to generate the HTML content for the webview.
 * This function now injects the GABC content into the client-side JavaScript.
 * @param {string} gabcContent The raw text content of the GABC file.
 * @param {{name: string, transcriber: string}} metadata The extracted metadata.
 */
function getWebviewContent(gabcContent, metadata) {
    // Escape the GABC content to safely embed it within a JavaScript string literal
    const escapedGabcContent = escapeHtml(gabcContent);

    const nameHtml = metadata.name ? `${metadata.name}` : '';
    const transcriberHtml = metadata.transcriber ? `${metadata.transcriber}` : '';

    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gabc preview</title>
    <style>
        body {
            background-color: var(--vscode-editor-background); /* Use VS Code's background color */
            color: var(--vscode-editor-foreground); /* Use VS Code's foreground color */
            font-family: var(--vscode-font-family);
            padding: 20px;
            width:100%;
        }
        .chant-container {
            background-color: white; /* Chant itself remains white */
            max-width: 95%; /* Adjust as needed */
            overflow-x: hidden; /* Changed from auto to hidden to remove horizontal scroll */
            border: 1px solid var(--vscode-editorGroup-border); /* Add a subtle border */
            box-sizing: border-box; /* Include padding and border in the element's total width and height */
            padding: 10px; /* Add some padding around the chant */
            color: black; /* Ensure chant content is black on white background */
        }
        .metadata-container {
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-editorGroup-border);
        }
        .metadata-item {
            margin: 5px 0;
            font-size: 0.9em;
            color: var(--vscode-editor-foreground);
        }
    </style>
</head>

<body>
    <h1>${nameHtml}</h1>
    <h3>Transcriber: ${transcriberHtml}</h3>
    <div id="svg-final" class="gabc final chant-container"></div>

    <!-- Exsurge.js library - Using the modern bbloomf/jgabc implementation via jsDelivr CDN -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/document-register-element/0.5.3/document-register-element.js"></script>
    <script type="text/javascript" src="https://cdn.jsdelivr.net/gh/bbloomf/jgabc@master/exsurge.min.js"></script>
    

    <script type="text/javascript">
        // The GABC source is now dynamically injected from the VS Code extension
        const gabcSourceString = \`${escapedGabcContent}\`;

        // Simplified function to directly use the GABC string
        function displayChant(gabcString, chantContainerId) {
            var ctxt = new exsurge.ChantContext();
            ctxt.lyricTextFont = "'Crimson Text', serif";
            ctxt.lyricTextSize *= 1.2;
            ctxt.dropCapTextFont = ctxt.lyricTextFont;
            ctxt.annotationTextFont = ctxt.lyricTextFont;

            var chantContainer = document.getElementById(chantContainerId);

            if (!chantContainer) {
                console.error("Invalid chant container ID provided.");
                return;
            }

            var score;

            function renderChant() {
                // The API usage remains largely the same for core functionality
                var mappings = exsurge.Gabc.createMappingsFromSource(ctxt, gabcString);
                score = new exsurge.ChantScore(ctxt, mappings, true);
                score.annotation = new exsurge.Annotation(ctxt, "%V%");

                score.performLayoutAsync(ctxt, function () {
                    score.layoutChantLines(ctxt, chantContainer.clientWidth, function () {
                        chantContainer.innerHTML = score.createSvg(ctxt);
                    });
                });
            }

            // Initial call to render the chant
            renderChant();

            // Optional: Add resize listener for responsive layout
            window.addEventListener('resize', function() {
                if (score) { // Ensure score exists before re-laying out
                    score.performLayoutAsync(ctxt, function () {
                        score.layoutChantLines(ctxt, chantContainer.clientWidth, function () {
                            chantContainer.innerHTML = score.createSvg(ctxt);
                        });
                    });
                }
            });
        }

        // Call the display function when the DOM is fully loaded
        document.addEventListener('DOMContentLoaded', function() {
            displayChant(gabcSourceString, 'svg-final');
        });
    </script>
</body>

</html>`;
}

/**
 * Basic utility to escape HTML characters from the GABC content.
 * This is crucial to prevent the GABC text from being interpreted as HTML tags
 * and to ensure it's a valid JavaScript string literal.
 * Specifically, we need to escape backticks, which are used for template literals.
 * @param {string} unsafe The string to escape.
 * @returns {string} The HTML-escaped and JavaScript-string-safe string.
 */
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&") // Escape ampersands first!
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, "\"")
        .replace(/'/g, "'")
        .replace(/`/g, "\\`")
        // Replace <sp>V/</sp>. and <sp>R/</sp>. with <sp>V/</sp> and <sp>R/</sp> respectively
        .replace(/<sp>(V|R)\/<\/sp>\./g, '<sp>$1/</sp>') // [1, 3, 5, 6, 8, 12]
        // Replace <nlba> and </nlba> with empty string
        .replace(/<\/?nlba>/g, '') // [1, 3, 5, 6, 8, 12]
        ;
}

/**
 * This function is called when your extension is deactivated.
 * Use it for any cleanup if necessary.
 */
function deactivate() {
    // In this specific example, our panels are disposed via onDidDispose,
    // so explicit cleanup here for them is not strictly necessary.
    // However, if you had other long-running resources, you'd clean them up here.
}

module.exports = {
    activate,
    deactivate
}